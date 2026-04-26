import type { LogLevel, RunStatus } from "@prisma/client";

export type RunFailureReason =
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

const failureReasonLabels: Record<RunFailureReason, string> = {
  AUTH: "Авторизация",
  BALANCE: "Баланс",
  QUOTA: "Квота",
  DAILY_LIMIT: "Дневной лимит",
  RATE_LIMIT: "Рейтлимит",
  IMAGE: "Образ",
  TIMEOUT: "Таймаут",
  PROVIDER: "Провайдер",
  PAYLOAD: "Ответ API",
  WORKER: "Воркер",
  UNKNOWN: "Сбой",
};

export function failureReasonLabel(reason?: string | null) {
  if (!reason) return failureReasonLabels.UNKNOWN;
  return failureReasonLabels[reason as RunFailureReason] ?? reason;
}

export function runStatusLabel(status: RunStatus, failureReason?: string | null) {
  if (status === "FAILED") return failureReasonLabel(failureReason);

  const labels: Record<RunStatus, string> = {
    QUEUED: "В очереди",
    RUNNING: "В работе",
    STOPPED: "Остановлен",
    FAILED: failureReasonLabels.UNKNOWN,
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
