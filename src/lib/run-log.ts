import type { LogLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function appendRunLog(runId: string, level: LogLevel, message: string, meta?: unknown) {
  return prisma.runLog.create({
    data: {
      runId,
      level,
      message,
      meta: meta === undefined ? undefined : JSON.parse(JSON.stringify(meta)),
    },
  });
}
