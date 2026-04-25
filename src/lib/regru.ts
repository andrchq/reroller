import type { ProviderAccount } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import { wait } from "@/lib/utils";

const apiUrl = "https://api.cloudvps.reg.ru";

type RegRuErrorDetails = {
  status: number;
  statusText: string;
  code?: string;
  message?: string;
  raw: string;
};

type RegRuReglet = {
  id: number;
  archived_at?: string | null;
  name?: string;
  hostname?: string;
  ip?: string;
  region_slug?: string;
  status?: string;
};

type RegRuIp = {
  id?: number;
  ip: string;
  region_slug?: string;
  reglet_id?: number | string | null;
  status?: string;
  type?: string;
};

export type RegRuServerProject = {
  id: string;
  name: string;
  url?: string;
  regions: string[];
};

export type RegRuFloatingIp = {
  id: string;
  floating_ip_address: string;
  project_id: string;
  region: string;
  status: string;
};

export class RegRuApiError extends Error {
  status: number;
  code?: string;
  raw: string;
  fatal: boolean;

  constructor(operation: string, details: RegRuErrorDetails) {
    const normalized = `${details.code ?? ""} ${details.message ?? ""} ${details.raw}`.toLowerCase();
    const isAuth = details.status === 401 || details.status === 403;
    const isBalance = normalized.includes("balance") || normalized.includes("money") || normalized.includes("payment") || normalized.includes("fund");
    const isLimit = normalized.includes("limit") || normalized.includes("quota") || normalized.includes("too many");
    const message = isAuth
      ? "Reg.ru: API token не принят. Проверьте токен CloudVPS API в панели Рег.облака и запустите профиль снова."
      : isBalance
        ? "Reg.ru: недостаточно баланса для создания дополнительного IP. Пополните баланс и запустите профиль снова."
        : isLimit
          ? "Reg.ru: достигнут лимит дополнительных IP на сервере или аккаунте. Освободите IP или увеличьте лимит."
          : `Reg.ru ${operation} failed: ${formatRegRuError(details)}`;

    super(message);
    this.name = "RegRuApiError";
    this.status = details.status;
    this.code = details.code;
    this.raw = details.raw;
    this.fatal = isAuth || isBalance || isLimit;
  }
}

function formatRegRuError(details: RegRuErrorDetails) {
  const code = details.code ? `${details.code}: ` : "";
  return `${details.status} ${details.statusText}: ${code}${details.message ?? details.raw}`;
}

async function readRegRuError(response: Response): Promise<RegRuErrorDetails> {
  const text = await response.text();
  if (!text) {
    return { status: response.status, statusText: response.statusText, raw: "" };
  }

  try {
    const payload = JSON.parse(text) as {
      error?: string;
      error_code?: string | number;
      code?: string | number;
      message?: string | string[];
      detail?: string;
      errors?: unknown;
    };
    const message = Array.isArray(payload.message)
      ? payload.message.join("; ")
      : payload.message ?? payload.detail ?? payload.error ?? (payload.errors ? JSON.stringify(payload.errors) : undefined);
    return {
      status: response.status,
      statusText: response.statusText,
      code: payload.error_code || payload.code ? String(payload.error_code ?? payload.code) : undefined,
      message,
      raw: text,
    };
  } catch {
    return { status: response.status, statusText: response.statusText, message: text, raw: text };
  }
}

async function createRegRuApiError(operation: string, response: Response) {
  return new RegRuApiError(operation, await readRegRuError(response));
}

async function regRuFetch(account: ProviderAccount, path: string, init: RequestInit = {}) {
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

export function normalizeRegRuServer(reglet: RegRuReglet): RegRuServerProject | null {
  if (!reglet.id || !reglet.region_slug) return null;
  if (reglet.archived_at || reglet.status === "archive") return null;
  const title = reglet.name || reglet.hostname || `Сервер ${reglet.id}`;
  const ipSuffix = reglet.ip ? ` / ${reglet.ip}` : "";
  return {
    id: String(reglet.id),
    name: `${title}${ipSuffix}`,
    regions: [reglet.region_slug],
  };
}

export function normalizeRegRuFloatingIp(ip: RegRuIp): RegRuFloatingIp | null {
  if (!ip.ip) return null;
  return {
    id: ip.ip,
    floating_ip_address: ip.ip,
    project_id: ip.reglet_id ? String(ip.reglet_id) : "",
    region: ip.region_slug ?? "",
    status: ip.status ?? "active",
  };
}

export async function listRegRuServers(account: ProviderAccount) {
  const response = await regRuFetch(account, "/v1/reglets");
  if (!response.ok) throw await createRegRuApiError("servers list", response);
  const payload = (await response.json()) as { reglets?: RegRuReglet[] };
  return (payload.reglets ?? []).map(normalizeRegRuServer).filter((item): item is RegRuServerProject => Boolean(item));
}

async function listRegRuIps(account: ProviderAccount, regletId: string) {
  const response = await regRuFetch(account, `/v1/ips?reglet_id=${encodeURIComponent(regletId)}`);
  if (!response.ok) throw await createRegRuApiError("IP list", response);
  const payload = (await response.json()) as { ips?: RegRuIp[] };
  return (payload.ips ?? []).filter((ip) => ip.type !== "ipv6");
}

export async function allocateRegRuFloatingIp(input: {
  account: ProviderAccount;
  regletId: string;
  region: string;
}) {
  const before = new Set((await listRegRuIps(input.account, input.regletId)).map((item) => item.ip));
  const response = await regRuFetch(input.account, "/v1/ips", {
    method: "POST",
    body: JSON.stringify({
      reglet_id: Number(input.regletId),
      ipv4_count: 1,
    }),
  });

  if (!response.ok) throw await createRegRuApiError("IP create", response);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(attempt === 0 ? 2_000 : 5_000);
    const after = await listRegRuIps(input.account, input.regletId);
    const created = after.find((item) => item.ip && !before.has(item.ip));
    if (created) {
      const floatingIp = normalizeRegRuFloatingIp({ ...created, reglet_id: input.regletId, region_slug: created.region_slug ?? input.region });
      if (floatingIp) return floatingIp;
    }
  }

  throw new Error("Reg.ru: IP создан асинхронно, но новый адрес не появился в списке за 60 секунд. Проверьте сервер в панели Reg.ru.");
}

export async function releaseRegRuFloatingIp(input: {
  account: ProviderAccount;
  floatingIpId: string;
}) {
  const response = await regRuFetch(input.account, `/v1/ips/${encodeURIComponent(input.floatingIpId)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw await createRegRuApiError("IP delete", response);
  }
}
