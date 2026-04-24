import { Queue } from "bullmq";
import IORedis from "ioredis";

export const runQueueName = "profile-runs";

export type RunJob = {
  runId: string;
};

export function createRedisConnection() {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

export function createRunQueue() {
  return new Queue<RunJob>(runQueueName, {
    connection: createRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
}

export async function enqueueRun(runId: string) {
  const queue = createRunQueue();
  try {
    await queue.add("profile-run", { runId });
  } finally {
    await queue.close();
  }
}
