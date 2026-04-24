import type { LogLevel, RunStatus } from "@prisma/client";

export function runStatusLabel(status: RunStatus) {
  const labels: Record<RunStatus, string> = {
    QUEUED: "В очереди",
    RUNNING: "В работе",
    STOPPED: "Остановлен",
    FAILED: "Ошибка",
    COMPLETED: "Завершен",
  };
  return labels[status];
}

export function logLevelLabel(level: LogLevel | string) {
  const labels: Record<string, string> = {
    INFO: "Инфо",
    WARN: "Внимание",
    ERROR: "Ошибка",
    SUCCESS: "Успех",
  };
  return labels[level] ?? level;
}
