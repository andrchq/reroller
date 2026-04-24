import { Worker } from "bullmq";
import { allocateFloatingIp, releaseFloatingIp } from "@/lib/selectel";
import { findMatchedTarget } from "@/lib/ip-matcher";
import { prisma } from "@/lib/prisma";
import { createRedisConnection, runQueueName, type RunJob } from "@/lib/queue";
import { appendRunLog } from "@/lib/run-log";
import { buildFindingMessage, sendTelegramMessage } from "@/lib/telegram";
import { wait } from "@/lib/utils";

async function processRun(runId: string) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      searchProfile: {
        include: {
          providerAccount: true,
          projectBinding: true,
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
  const maxAttempts = rateLimit?.maxAttempts ?? 100;
  const minDelayMs = rateLimit?.minDelayMs ?? 10_000;
  const cooldownAfterError = rateLimit?.cooldownAfterError ?? 60_000;

  await prisma.run.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  await appendRunLog(runId, "INFO", `Запуск профиля "${profile.name}"`);

  for (let attempt = run.attempts + 1; attempt <= maxAttempts; attempt += 1) {
    const current = await prisma.run.findUnique({ where: { id: runId }, select: { status: true } });
    if (!current || current.status === "STOPPED") {
      await appendRunLog(runId, "WARN", "Запуск остановлен оператором");
      return;
    }

    await prisma.run.update({ where: { id: runId }, data: { attempts: attempt } });

    try {
      const requestedIp = targets.find((target) => !target.includes("/"));
      await appendRunLog(runId, "INFO", `Попытка ${attempt}: запрос Floating IP в ${profile.region}`);
      const floatingIp = await allocateFloatingIp({
        account: profile.providerAccount,
        projectId: profile.projectBinding.externalProjectId,
        projectName: profile.projectBinding.name,
        region: profile.region,
        requestedIp,
      });

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
            region: profile.region,
            raw: floatingIp,
          },
        });
        await appendRunLog(runId, "SUCCESS", `Найден подходящий IP ${address} для цели ${matchedTarget}`);

        const sent = await sendTelegramMessage(
          buildFindingMessage({
            profileName: profile.name,
            accountName: profile.providerAccount.name,
            projectName: profile.projectBinding.name,
            region: profile.region,
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

        await prisma.run.update({
          where: { id: runId },
          data: { status: "COMPLETED", stoppedAt: new Date() },
        });
        return;
      }

      await appendRunLog(runId, "INFO", `IP ${address} не совпал, удаляю Floating IP`);
      await releaseFloatingIp({
        account: profile.providerAccount,
        projectName: profile.projectBinding.name,
        floatingIpId: floatingIp.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown worker error";
      await appendRunLog(runId, "ERROR", message);
      await wait(cooldownAfterError);
    }

    await wait(minDelayMs);
  }

  await appendRunLog(runId, "WARN", "Достигнут лимит попыток профиля");
  await prisma.run.update({
    where: { id: runId },
    data: { status: "FAILED", stoppedAt: new Date() },
  });
}

const worker = new Worker<RunJob>(
  runQueueName,
  async (job) => processRun(job.data.runId),
  { connection: createRedisConnection(), concurrency: 1 },
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

console.log(`Reroller worker listening on ${runQueueName}`);
