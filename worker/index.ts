import { Worker } from "bullmq";
import { allocateFloatingIp, SelectelApiError } from "@/lib/selectel";
import { allocateTimewebFloatingIp, TimewebApiError } from "@/lib/timeweb";
import { allocateRegRuFloatingIp, RegRuApiError } from "@/lib/regru";
import { findMatchedTarget } from "@/lib/ip-matcher";
import { prisma } from "@/lib/prisma";
import { releaseProviderFloatingIp } from "@/lib/provider-floating-ip";
import { createRedisConnection, runQueueName, type RunJob } from "@/lib/queue";
import { appendRunLog } from "@/lib/run-log";
import { buildFindingMessage, sendTelegramMessage } from "@/lib/telegram";
import { wait } from "@/lib/utils";

type FailureReason =
  | "AUTH"
  | "BALANCE"
  | "QUOTA"
  | "DAILY_LIMIT"
  | "RATE_LIMIT"
  | "IMAGE"
  | "TIMEOUT"
  | "PROVIDER"
  | "PAYLOAD"
  | "WORKER"
  | "UNKNOWN";

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

function workerLockDurationMs() {
  const value = Number(process.env.WORKER_LOCK_DURATION_MS ?? 10 * 60 * 1000);
  return Number.isFinite(value) && value >= 60_000 ? Math.floor(value) : 10 * 60 * 1000;
}

function workerStalledIntervalMs() {
  const value = Number(process.env.WORKER_STALLED_INTERVAL_MS ?? 60_000);
  return Number.isFinite(value) && value >= 30_000 ? Math.floor(value) : 60_000;
}

function workerMaxStalledCount() {
  const value = Number(process.env.WORKER_MAX_STALLED_COUNT ?? 3);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 3;
}

function timewebDailyFloatingIpLimit() {
  const value = Number(process.env.TIMEWEB_DAILY_FLOATING_IP_CREATE_LIMIT ?? 10);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
}

function timewebDailyLimitRetryMs() {
  return 2 * 60 * 60 * 1000;
}

function moscowDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function getProviderDailyUsage(input: {
  providerAccountId: string;
  provider: string;
  operation: string;
  day: string;
}) {
  return prisma.providerDailyUsage.findUnique({
    where: {
      providerAccountId_provider_operation_day: input,
    },
    select: { count: true },
  });
}

async function incrementProviderDailyUsage(input: {
  providerAccountId: string;
  provider: string;
  operation: string;
  day: string;
}) {
  await prisma.providerDailyUsage.upsert({
    where: {
      providerAccountId_provider_operation_day: input,
    },
    create: {
      ...input,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
  });
}

async function setProviderDailyUsage(input: {
  providerAccountId: string;
  provider: string;
  operation: string;
  day: string;
  count: number;
}) {
  await prisma.providerDailyUsage.upsert({
    where: {
      providerAccountId_provider_operation_day: {
        providerAccountId: input.providerAccountId,
        provider: input.provider,
        operation: input.operation,
        day: input.day,
      },
    },
    create: input,
    update: { count: input.count },
  });
}

function remainingMs(deadline: number) {
  return Math.max(0, deadline - Date.now());
}

async function waitWithDeadline(ms: number, deadline: number) {
  const delay = Math.min(ms, remainingMs(deadline));
  if (delay > 0) await wait(delay);
}

async function waitUntilRetryOrStop(runId: string, ms: number) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const current = await prisma.run.findUnique({ where: { id: runId }, select: { status: true } });
    if (!current || current.status === "STOPPED") return false;
    await wait(Math.min(30_000, deadline - Date.now()));
  }
  return true;
}

async function runWasStopped(runId: string) {
  const current = await prisma.run.findUnique({ where: { id: runId }, select: { status: true } });
  return !current || current.status === "STOPPED";
}

async function stopBeforeNextAttempt(runId: string) {
  await prisma.run.update({
    where: { id: runId },
    data: { status: "STOPPED", failureReason: null, stoppedAt: new Date() },
  });
  await appendRunLog(runId, "WARN", "Запуск остановлен оператором перед следующей попыткой");
}

function classifyFailureReason(error: unknown): FailureReason {
  if (error instanceof TimewebApiError) {
    if (error.code === "daily_limit_exceeded") return "DAILY_LIMIT";
    if (error.code === "no_balance_for_month") return "BALANCE";
    if (error.status === 401 || error.status === 403) return "AUTH";
    if (error.status === 429) return "RATE_LIMIT";
    return "PROVIDER";
  }

  if (error instanceof SelectelApiError) {
    if (error.code === "quota_exceeded") return "QUOTA";
    if (error.status === 401 || error.status === 403) return "AUTH";
    if (error.status === 429) return "RATE_LIMIT";
    return "PROVIDER";
  }

  if (error instanceof RegRuApiError) {
    const message = error.message.toLowerCase();
    if (error.status === 401 || error.status === 403 || message.includes("token")) return "AUTH";
    if (message.includes("баланс") || message.includes("balance")) return "BALANCE";
    if (message.includes("лимит") || message.includes("limit") || message.includes("quota")) return "QUOTA";
    if (message.includes("образ") || message.includes("image")) return "IMAGE";
    if (error.status === 429) return "RATE_LIMIT";
    return "PROVIDER";
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("quota") || message.includes("квот")) return "QUOTA";
  if (message.includes("balance") || message.includes("баланс")) return "BALANCE";
  if (message.includes("401") || message.includes("403") || message.includes("auth") || message.includes("token")) return "AUTH";
  if (message.includes("429") || message.includes("rate")) return "RATE_LIMIT";
  if (message.includes("image_not_found") || message.includes("image not found") || message.includes("образ")) return "IMAGE";
  if (message.includes("unexpected payload")) return "PAYLOAD";
  if (message.includes("timed out") || message.includes("timeout")) return "TIMEOUT";
  if (message.includes("stalled") || message.includes("lock")) return "WORKER";
  return "UNKNOWN";
}

async function failRun(runId: string, reason: FailureReason) {
  await prisma.run.update({
    where: { id: runId },
    data: { status: "FAILED", failureReason: reason, stoppedAt: new Date() },
  });
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
  const serverWaitIntervalSeconds = Math.max(5, rateLimit?.serverWaitIntervalSeconds ?? 10);
  const serverWaitMaxSeconds = Math.max(60, rateLimit?.serverWaitMaxSeconds ?? 240);
  let deadline = Date.now() + maxRuntimeSeconds * 1000;
  const requestTimestamps: number[] = [];
  const regionCooldownUntil = new Map<string, number>();
  const dailyUsageOperation = "floating-ip-create";
  const timewebDailyLimit = timewebDailyFloatingIpLimit();
  let consecutiveErrors = 0;
  let lastFailureReason: FailureReason | null = null;
  let foundCount = await prisma.finding.count({ where: { runId } });

  await prisma.run.update({
    where: { id: runId },
    data: { status: "RUNNING", failureReason: null, startedAt: new Date() },
  });
  await appendRunLog(
    runId,
    "INFO",
    `Запуск профиля "${profile.name}". Зоны: ${regions.join(", ")}. Время работы: ${maxRuntimeSeconds} сек. Задержка: ${delayMinSeconds}-${delayMaxSeconds} сек. Лимит: ${requestsPerMinute}/мин. Лимит находок: ${maxFindings}.`,
  );

  for (let attempt = run.attempts + 1; Date.now() < deadline && foundCount < maxFindings; attempt += 1) {
    if (await runWasStopped(runId)) {
      await appendRunLog(runId, "WARN", "Запуск остановлен оператором перед следующей попыткой");
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
      if (profile.providerAccount.provider === "timeweb") {
        const day = moscowDayKey();
        const usage = await getProviderDailyUsage({
          providerAccountId: profile.providerAccount.id,
          provider: "timeweb",
          operation: dailyUsageOperation,
          day,
        });
        const used = usage?.count ?? 0;
        if (used >= timewebDailyLimit) {
          await appendRunLog(
            runId,
            "WARN",
            `Timeweb: дневной лимит создания Floating IP исчерпан (${used}/${timewebDailyLimit}) за ${day}. Следующая проверка через 2 часа.`,
          );
          lastFailureReason = "DAILY_LIMIT";
          const retryMs = timewebDailyLimitRetryMs();
          const canContinue = await waitUntilRetryOrStop(runId, retryMs);
          if (!canContinue) {
            await appendRunLog(runId, "WARN", "Запуск остановлен оператором");
            return;
          }
          deadline += retryMs;
          continue;
        }
      }

      await appendRunLog(runId, "INFO", `Попытка ${attempt}: запрос Floating IP в ${selectedRegion}`);
      requestTimestamps.push(Date.now());
      const floatingIp =
        profile.providerAccount.provider === "timeweb"
          ? await allocateTimewebFloatingIp({
              account: profile.providerAccount,
              region: selectedRegion,
            })
          : profile.providerAccount.provider === "regru"
            ? await allocateRegRuFloatingIp({
                account: profile.providerAccount,
                regletId: profile.projectBinding.externalProjectId,
                region: selectedRegion,
                waitIntervalSeconds: serverWaitIntervalSeconds,
                waitMaxSeconds: serverWaitMaxSeconds,
                onLog: async (message) => {
                  await appendRunLog(runId, "INFO", message);
                },
              })
            : await allocateFloatingIp({
                account: profile.providerAccount,
                projectId: profile.projectBinding.externalProjectId,
                projectName: profile.projectBinding.name,
                region: selectedRegion,
                requestedIp,
              });

      consecutiveErrors = 0;
      if (profile.providerAccount.provider === "timeweb") {
        await incrementProviderDailyUsage({
          providerAccountId: profile.providerAccount.id,
          provider: "timeweb",
          operation: dailyUsageOperation,
          day: moscowDayKey(),
        });
      }
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

        if (await runWasStopped(runId)) {
          await stopBeforeNextAttempt(runId);
          return;
        }

        if (foundCount >= maxFindings) {
          await appendRunLog(runId, "SUCCESS", `Достигнут лимит найденных IP: ${maxFindings}`);
          await prisma.run.update({
            where: { id: runId },
            data: { status: "COMPLETED", failureReason: null, stoppedAt: new Date() },
          });
          return;
        }

        const delaySeconds = randomInt(delayMinSeconds, delayMaxSeconds);
        await appendRunLog(runId, "INFO", `Пауза перед следующей попыткой: ${delaySeconds} сек.`);
        await waitWithDeadline(delaySeconds * 1000, deadline);
        continue;
      }

      await appendRunLog(runId, "INFO", `IP ${address} не совпал, удаляю Floating IP`);
      const cleanup = await releaseProviderFloatingIp({
        account: profile.providerAccount,
        projectId: profile.projectBinding.externalProjectId,
        projectName: profile.projectBinding.name,
        floatingIpId: floatingIp.id,
      });
      if (cleanup) {
        await appendRunLog(
          runId,
          "INFO",
          `Очистка сетевых ресурсов завершена. Подсетей: ${cleanup.subnetsDeleted}, портов роутера: ${cleanup.routerPortsDeleted}, роутеров: ${cleanup.routersDeleted}, сетей: ${cleanup.networksDeleted}, пропущено: ${cleanup.subnetsSkipped + cleanup.networkSkipped}.`,
        );
      }

      if (await runWasStopped(runId)) {
        await stopBeforeNextAttempt(runId);
        return;
      }

      const delaySeconds = randomInt(delayMinSeconds, delayMaxSeconds);
      await appendRunLog(runId, "INFO", `Пауза перед следующей попыткой: ${delaySeconds} сек.`);
      await waitWithDeadline(delaySeconds * 1000, deadline);
    } catch (error) {
      if (error instanceof TimewebApiError && error.code === "daily_limit_exceeded") {
        const day = moscowDayKey();
        await setProviderDailyUsage({
          providerAccountId: profile.providerAccount.id,
          provider: "timeweb",
          operation: dailyUsageOperation,
          day,
          count: timewebDailyLimit,
        });
        await appendRunLog(runId, "ERROR", error.message);
        await appendRunLog(
          runId,
          "WARN",
          `Timeweb вернул daily_limit_exceeded. Лимит на ${day} зафиксирован как ${timewebDailyLimit}/${timewebDailyLimit}. Следующая проверка через 2 часа.`,
        );
        consecutiveErrors = 0;
        lastFailureReason = "DAILY_LIMIT";
        const retryMs = timewebDailyLimitRetryMs();
        const canContinue = await waitUntilRetryOrStop(runId, retryMs);
        if (!canContinue) {
          await appendRunLog(runId, "WARN", "Запуск остановлен оператором");
          return;
        }
        deadline += retryMs;
        continue;
      }

      if (error instanceof TimewebApiError && error.code === "no_balance_for_month") {
        await appendRunLog(runId, "ERROR", error.message);
        await appendRunLog(
          runId,
          "WARN",
          "Задача остановлена автоматически: Timeweb не разрешает создать Floating IP без доступного баланса или месячного лимита.",
        );
        await failRun(runId, "BALANCE");
        return;
      }

      if (error instanceof RegRuApiError && error.fatal) {
        await appendRunLog(runId, "ERROR", error.message);
        await appendRunLog(runId, "WARN", "Задача остановлена автоматически: ошибка Reg.ru не исправится повторными попытками.");
        await failRun(runId, classifyFailureReason(error));
        return;
      }

      if (error instanceof SelectelApiError && error.code === "quota_exceeded") {
        lastFailureReason = "QUOTA";
        const quotaRegion = error.region ?? selectedRegion;
        regionCooldownUntil.set(quotaRegion, Math.min(deadline, Date.now() + 15 * 60 * 1000));
        await appendRunLog(runId, "WARN", `Квота Floating IP исчерпана в зоне ${quotaRegion}. Зона исключена из выбора на 15 минут.`);
      }

      consecutiveErrors += 1;
      lastFailureReason = classifyFailureReason(error);
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
      data: { status: "COMPLETED", failureReason: null, stoppedAt: new Date() },
    });
    return;
  }

  await appendRunLog(runId, "WARN", "Истекло заданное время работы профиля");
  await failRun(runId, lastFailureReason ?? "TIMEOUT");
}

const worker = new Worker<RunJob>(
  runQueueName,
  async (job) => processRun(job.data.runId),
  {
    connection: createRedisConnection(),
    concurrency: workerConcurrency(),
    lockDuration: workerLockDurationMs(),
    stalledInterval: workerStalledIntervalMs(),
    maxStalledCount: workerMaxStalledCount(),
  },
);

worker.on("failed", async (job, error) => {
  if (job?.data.runId) {
    await appendRunLog(job.data.runId, "ERROR", error.message);
    await failRun(job.data.runId, classifyFailureReason(error));
  }
});

console.log(
  `Reroller worker listening on ${runQueueName} with concurrency ${workerConcurrency()}, lock ${workerLockDurationMs()}ms, stalled interval ${workerStalledIntervalMs()}ms`,
);
