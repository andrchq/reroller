import { Worker } from "bullmq";
import { allocateFloatingIp, SelectelApiError } from "@/lib/selectel";
import { allocateTimewebFloatingIp, TimewebApiError } from "@/lib/timeweb";
import { findMatchedTarget } from "@/lib/ip-matcher";
import { prisma } from "@/lib/prisma";
import { releaseProviderFloatingIp } from "@/lib/provider-floating-ip";
import { createRedisConnection, runQueueName, type RunJob } from "@/lib/queue";
import { appendRunLog } from "@/lib/run-log";
import { buildFindingMessage, sendTelegramMessage } from "@/lib/telegram";
import { wait } from "@/lib/utils";

function randomInt(min: number, max: number) {
  const safeMin = Math.ceil(Math.min(min, max));
  const safeMax = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function randomFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function workerConcurrency() {
  const value = Number(process.env.WORKER_CONCURRENCY ?? 100);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 100;
}

function remainingMs(deadline: number) {
  return Math.max(0, deadline - Date.now());
}

async function waitWithDeadline(ms: number, deadline: number) {
  const delay = Math.min(ms, remainingMs(deadline));
  if (delay > 0) await wait(delay);
}

async function processRun(runId: string) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      searchProfile: {
        include: {
          providerAccount: true,
          projectBinding: true,
          selectedRegions: true,
          targets: true,
          rateLimit: true,
        },
      },
    },
  });

  if (!run) return;

  const profile = run.searchProfile;
  const rateLimit = profile.rateLimit;
  const targets = profile.targets.map((target) => target.value);
  const regions = profile.selectedRegions.length > 0 ? profile.selectedRegions.map((region) => region.name) : [profile.region];
  const requestsPerMinute = Math.max(1, rateLimit?.requestsPerMinute ?? 6);
  const minDelaySeconds = Math.max(1, rateLimit?.minDelaySeconds ?? 10);
  const rateDelaySeconds = Math.ceil(60 / requestsPerMinute);
  const delayMinSeconds = Math.max(minDelaySeconds, rateDelaySeconds);
  const delayMaxSeconds = Math.max(delayMinSeconds, rateLimit?.maxDelaySeconds ?? 30);
  const errorDelaySeconds = Math.max(1, rateLimit?.errorDelaySeconds ?? 60);
  const maxRuntimeSeconds = Math.max(60, rateLimit?.maxRuntimeSeconds ?? 3600);
  const maxFindings = Math.max(1, rateLimit?.maxFindings ?? 1);
  const deadline = Date.now() + maxRuntimeSeconds * 1000;
  const requestTimestamps: number[] = [];
  const regionCooldownUntil = new Map<string, number>();
  let consecutiveErrors = 0;
  let foundCount = await prisma.finding.count({ where: { runId } });

  await prisma.run.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  await appendRunLog(
    runId,
    "INFO",
    `Запуск профиля "${profile.name}". Зоны: ${regions.join(", ")}. Время работы: ${maxRuntimeSeconds} сек. Задержка: ${delayMinSeconds}-${delayMaxSeconds} сек. Лимит: ${requestsPerMinute}/мин. Лимит находок: ${maxFindings}.`,
  );

  for (let attempt = run.attempts + 1; Date.now() < deadline && foundCount < maxFindings; attempt += 1) {
    const current = await prisma.run.findUnique({ where: { id: runId }, select: { status: true } });
    if (!current || current.status === "STOPPED") {
      await appendRunLog(runId, "WARN", "Запуск остановлен оператором");
      return;
    }

    const now = Date.now();
    while (requestTimestamps.length > 0 && now - requestTimestamps[0] >= 60_000) {
      requestTimestamps.shift();
    }
    if (requestTimestamps.length >= requestsPerMinute) {
      const waitMs = requestTimestamps[0] + 60_000 - now + randomInt(250, 1250);
      await appendRunLog(runId, "INFO", `Лимит ${requestsPerMinute}/мин: пауза ${Math.ceil(waitMs / 1000)} сек.`);
      await waitWithDeadline(waitMs, deadline);
      continue;
    }

    const availableRegions = regions.filter((region) => (regionCooldownUntil.get(region) ?? 0) <= Date.now());
    if (availableRegions.length === 0) {
      const nextAvailableAt = Math.min(...regions.map((region) => regionCooldownUntil.get(region) ?? Date.now()));
      const waitMs = Math.max(1_000, nextAvailableAt - Date.now());
      await appendRunLog(runId, "WARN", `Все выбранные зоны временно недоступны по квотам. Пауза ${Math.ceil(waitMs / 1000)} сек.`);
      await waitWithDeadline(waitMs, deadline);
      continue;
    }

    await prisma.run.update({ where: { id: runId }, data: { attempts: attempt } });
    const selectedRegion = availableRegions[randomInt(0, availableRegions.length - 1)];

    try {
      const requestedIp = targets.find((target) => !target.includes("/"));
      await appendRunLog(runId, "INFO", `Попытка ${attempt}: запрос Floating IP в ${selectedRegion}`);
      requestTimestamps.push(Date.now());
      const floatingIp =
        profile.providerAccount.provider === "timeweb"
          ? await allocateTimewebFloatingIp({
              account: profile.providerAccount,
              region: selectedRegion,
            })
          : await allocateFloatingIp({
              account: profile.providerAccount,
              projectId: profile.projectBinding.externalProjectId,
              projectName: profile.projectBinding.name,
              region: selectedRegion,
              requestedIp,
            });

      consecutiveErrors = 0;
      const address = floatingIp.floating_ip_address;
      const matchedTarget = findMatchedTarget(targets, address);
      if (matchedTarget) {
        const finding = await prisma.finding.create({
          data: {
            searchProfileId: profile.id,
            runId,
            floatingIpId: floatingIp.id,
            floatingIpAddress: address,
            projectId: profile.projectBinding.externalProjectId,
            region: selectedRegion,
            raw: floatingIp,
          },
        });
        foundCount += 1;
        await appendRunLog(runId, "SUCCESS", `Найден подходящий IP ${address} для цели ${matchedTarget}. Находок: ${foundCount}/${maxFindings}`);

        const sent = await sendTelegramMessage(
          buildFindingMessage({
            profileName: profile.name,
            accountName: profile.providerAccount.name,
            projectName: profile.projectBinding.name,
            region: selectedRegion,
            floatingIpAddress: address,
            floatingIpId: floatingIp.id,
          }),
        );
        if (sent) {
          await prisma.finding.update({
            where: { id: finding.id },
            data: { notificationSentAt: new Date() },
          });
          await appendRunLog(runId, "SUCCESS", "Telegram-уведомление отправлено");
        } else {
          await appendRunLog(runId, "WARN", "Telegram не настроен или уведомление не отправлено");
        }

        if (foundCount >= maxFindings) {
          await appendRunLog(runId, "SUCCESS", `Достигнут лимит найденных IP: ${maxFindings}`);
          await prisma.run.update({
            where: { id: runId },
            data: { status: "COMPLETED", stoppedAt: new Date() },
          });
          return;
        }

        const delaySeconds = randomInt(delayMinSeconds, delayMaxSeconds);
        await appendRunLog(runId, "INFO", `Пауза перед следующей попыткой: ${delaySeconds} сек.`);
        await waitWithDeadline(delaySeconds * 1000, deadline);
        continue;
      }

      await appendRunLog(runId, "INFO", `IP ${address} не совпал, удаляю Floating IP`);
      await releaseProviderFloatingIp({
        account: profile.providerAccount,
        projectName: profile.projectBinding.name,
        floatingIpId: floatingIp.id,
      });

      const delaySeconds = randomInt(delayMinSeconds, delayMaxSeconds);
      await appendRunLog(runId, "INFO", `Пауза перед следующей попыткой: ${delaySeconds} сек.`);
      await waitWithDeadline(delaySeconds * 1000, deadline);
    } catch (error) {
      if (error instanceof TimewebApiError && error.code === "no_balance_for_month") {
        await appendRunLog(runId, "ERROR", error.message);
        await appendRunLog(
          runId,
          "WARN",
          "Задача остановлена автоматически: Timeweb не разрешает создать Floating IP без доступного баланса или месячного лимита.",
        );
        await prisma.run.update({
          where: { id: runId },
          data: { status: "FAILED", stoppedAt: new Date() },
        });
        return;
      }

      if (error instanceof SelectelApiError && error.code === "quota_exceeded") {
        const quotaRegion = error.region ?? selectedRegion;
        regionCooldownUntil.set(quotaRegion, Math.min(deadline, Date.now() + 15 * 60 * 1000));
        await appendRunLog(runId, "WARN", `Квота Floating IP исчерпана в зоне ${quotaRegion}. Зона исключена из выбора на 15 минут.`);
      }

      consecutiveErrors += 1;
      const message = error instanceof Error ? error.message : "Unknown worker error";
      await appendRunLog(runId, "ERROR", message);

      const multiplier = consecutiveErrors === 1 ? 1 : Math.pow(randomFloat(2, 3), consecutiveErrors - 1);
      const delaySeconds = Math.ceil(errorDelaySeconds * multiplier);
      await appendRunLog(
        runId,
        "WARN",
        `Пауза после ошибки: ${delaySeconds} сек. Ошибок подряд: ${consecutiveErrors}.`,
      );
      await waitWithDeadline(delaySeconds * 1000, deadline);
    }
  }

  if (foundCount >= maxFindings) {
    await appendRunLog(runId, "SUCCESS", `Достигнут лимит найденных IP: ${maxFindings}`);
    await prisma.run.update({
      where: { id: runId },
      data: { status: "COMPLETED", stoppedAt: new Date() },
    });
    return;
  }

  await appendRunLog(runId, "WARN", "Истекло заданное время работы профиля");
  await prisma.run.update({
    where: { id: runId },
    data: { status: "FAILED", stoppedAt: new Date() },
  });
}

const worker = new Worker<RunJob>(
  runQueueName,
  async (job) => processRun(job.data.runId),
  { connection: createRedisConnection(), concurrency: workerConcurrency() },
);

worker.on("failed", async (job, error) => {
  if (job?.data.runId) {
    await appendRunLog(job.data.runId, "ERROR", error.message);
    await prisma.run.update({
      where: { id: job.data.runId },
      data: { status: "FAILED", stoppedAt: new Date() },
    });
  }
});

console.log(`Reroller worker listening on ${runQueueName} with concurrency ${workerConcurrency()}`);
