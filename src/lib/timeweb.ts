import type { ProviderAccount } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";

const apiUrl = "https://api.timeweb.cloud";

type TimewebProject = {
  id: number;
  name: string;
};

type TimewebLocation = {
  availability_zones?: string[];
};

export type TimewebFloatingIp = {
  id: string;
  floating_ip_address: string;
  project_id: string;
  region: string;
  status: string;
};

type TimewebErrorDetails = {
  status: number;
  statusText: string;
  code?: string;
  message?: string;
  raw: string;
};

export class TimewebApiError extends Error {
  status: number;
  code?: string;
  raw: string;
  fatal: boolean;

  constructor(operation: string, details: TimewebErrorDetails) {
    const message =
      details.code === "no_balance_for_month"
        ? `Timeweb: недостаточно баланса или месячного лимита для создания Floating IP. Пополните баланс или проверьте лимиты в панели Timeweb, затем запустите профиль снова.`
        : details.code === "daily_limit_exceeded"
          ? "Timeweb: достигнут дневной лимит создания Floating IP. Задачу можно продолжить после сброса дневного лимита."
        : `Timeweb ${operation} failed: ${formatTimewebError(details)}`;

    super(message);
    this.name = "TimewebApiError";
    this.status = details.status;
    this.code = details.code;
    this.raw = details.raw;
    this.fatal = details.code === "no_balance_for_month" || details.code === "daily_limit_exceeded";
  }
}

function formatTimewebError(details: TimewebErrorDetails) {
  const code = details.code ?? "error";
  return `${details.status} ${details.statusText}: ${code}${details.message ? `: ${details.message}` : ""}`;
}

async function readTimewebError(response: Response): Promise<TimewebErrorDetails> {
  const text = await response.text();
  if (!text) {
    return {
      status: response.status,
      statusText: response.statusText,
      raw: "",
    };
  }

  try {
    const payload = JSON.parse(text) as { error_code?: string; message?: string | string[] };
    const message = Array.isArray(payload.message) ? payload.message.join("; ") : payload.message;
    return {
      status: response.status,
      statusText: response.statusText,
      code: payload.error_code,
      message,
      raw: text,
    };
  } catch {
    return {
      status: response.status,
      statusText: response.statusText,
      message: text,
      raw: text,
    };
  }
}

async function createTimewebApiError(operation: string, response: Response) {
  return new TimewebApiError(operation, await readTimewebError(response));
}

async function timewebFetch(account: ProviderAccount, path: string, init: RequestInit = {}) {
  const token = decryptSecret(account.encryptedPassword);
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

export async function listTimewebProjects(account: ProviderAccount) {
  const response = await timewebFetch(account, "/api/v1/projects");
  if (!response.ok) throw await createTimewebApiError("projects", response);
  const payload = (await response.json()) as { projects?: TimewebProject[] };
  return payload.projects ?? [];
}

export async function listTimewebZones(account: ProviderAccount) {
  const response = await timewebFetch(account, "/api/v2/locations");
  if (!response.ok) throw await createTimewebApiError("locations", response);
  const payload = (await response.json()) as { locations?: TimewebLocation[] };
  return [...new Set((payload.locations ?? []).flatMap((location) => location.availability_zones ?? []))].sort();
}

export function normalizeTimewebFloatingIp(payload: unknown): TimewebFloatingIp | null {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const ip = root?.ip && typeof root.ip === "object" ? (root.ip as Record<string, unknown>) : root;
  if (!ip) return null;

  const id = typeof ip.id === "string" ? ip.id : "";
  const address = typeof ip.ip === "string" ? ip.ip : "";
  const zone = typeof ip.availability_zone === "string" ? ip.availability_zone : "";
  if (!id || !address) return null;

  return {
    id,
    floating_ip_address: address,
    project_id: "",
    region: zone,
    status: "ACTIVE",
  };
}

export async function allocateTimewebFloatingIp(input: {
  account: ProviderAccount;
  region: string;
}) {
  const response = await timewebFetch(input.account, "/api/v1/floating-ips", {
    method: "POST",
    body: JSON.stringify({
      is_ddos_guard: false,
      availability_zone: input.region,
    }),
  });
  if (!response.ok) throw await createTimewebApiError("floating IP create", response);
  const payload = await response.json();
  const floatingIp = normalizeTimewebFloatingIp(payload);
  if (!floatingIp) throw new Error(`Timeweb floating IP create returned an unexpected payload: ${JSON.stringify(payload).slice(0, 700)}`);
  return floatingIp;
}

export async function releaseTimewebFloatingIp(input: {
  account: ProviderAccount;
  floatingIpId: string;
}) {
  const response = await timewebFetch(input.account, `/api/v1/floating-ips/${input.floatingIpId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw await createTimewebApiError("floating IP delete", response);
  }
}
