import type { ProviderAccount } from "@prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

const identityUrl = "https://cloud.api.selcloud.ru/identity/v3/auth/tokens";
const vpcUrl = "https://api.selectel.ru/vpc/resell/v2";

function providerHttpTimeoutMs() {
  const value = Number(process.env.PROVIDER_HTTP_TIMEOUT_MS ?? 120_000);
  return Number.isFinite(value) && value >= 10_000 ? Math.floor(value) : 120_000;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerHttpTimeoutMs());
  try {
    return await fetch(url, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Selectel request timed out after ${Math.ceil(providerHttpTimeoutMs() / 1000)} sec`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

type SelectelProject = {
  id: string;
  name: string;
  url?: string;
};

type SelectelProjectDetails = SelectelProject & {
  quotas?: Record<string, Array<{ region?: string; zone?: string; value?: number; used?: number }>>;
};

type TokenScope =
  | { type: "account" }
  | { type: "project"; projectName: string };

const projectTokenCache = new Map<string, { token: string; expiresAt: number }>();

export const defaultSelectelRegions = ["ru-2", "ru-6", "ru-7", "gis-1", "ru-1", "ru-3", "ru-9", "gis-2"];

export type SelectelFloatingIp = {
  id: string;
  floating_ip_address: string;
  fixed_ip_address?: string;
  project_id: string;
  region: string;
  status: string;
};

export class SelectelApiError extends Error {
  status: number;
  code?: string;
  region?: string;

  constructor(message: string, input: { status: number; code?: string; region?: string }) {
    super(message);
    this.name = "SelectelApiError";
    this.status = input.status;
    this.code = input.code;
    this.region = input.region;
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export function normalizeFloatingIpPayload(payload: unknown): SelectelFloatingIp | null {
  const root = asRecord(payload);
  if (!root) return null;

  const candidates = [
    root.floatingip,
    root.floating_ip,
    Array.isArray(root.floatingips) ? root.floatingips[0] : null,
    Array.isArray(root.floating_ips) ? root.floating_ips[0] : null,
    root,
  ];

  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (!record) continue;

    const id = pickString(record, ["id", "uuid", "floatingip_id", "floating_ip_id"]);
    const floatingIpAddress = pickString(record, ["floating_ip_address", "ip_address", "address", "ip"]);
    if (!id || !floatingIpAddress) continue;

    return {
      id,
      floating_ip_address: floatingIpAddress,
      fixed_ip_address: pickString(record, ["fixed_ip_address"]),
      project_id: pickString(record, ["project_id", "project"]),
      region: pickString(record, ["region"]),
      status: pickString(record, ["status"]) || "UNKNOWN",
    };
  }

  return null;
}

function shortPayload(payload: unknown) {
  return JSON.stringify(payload).slice(0, 700);
}

async function readError(response: Response) {
  const text = await response.text();
  return `${response.status} ${response.statusText}${text ? `: ${text}` : ""}`;
}

async function buildSelectelError(response: Response, prefix: string) {
  const text = await response.text();
  let code: string | undefined;
  let region: string | undefined;
  let detail = text;

  if (text) {
    try {
      const payload = JSON.parse(text) as {
        error?: string;
        message?: string;
        quotas?: Record<string, Array<{ region?: string | null; zone?: string | null; value?: number; used?: number }>>;
      };
      code = payload.error;
      const quota = payload.quotas ? Object.values(payload.quotas).flat()[0] : null;
      region = quota?.region ?? undefined;
      if (payload.error === "quota_exceeded" && quota) {
        detail = `превышена квота Floating IP${quota.region ? ` в зоне ${quota.region}` : ""}: используется ${quota.used ?? "?"} из ${quota.value ?? "?"}`;
      } else {
        detail = payload.message || payload.error || text;
      }
    } catch {
      detail = text;
    }
  }

  return new SelectelApiError(`${prefix}: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`, {
    status: response.status,
    code,
    region,
  });
}

function tokenScopeBody(account: ProviderAccount, password: string, scope: TokenScope) {
  return {
    auth: {
      identity: {
        methods: ["password"],
        password: {
          user: {
            name: account.username,
            domain: { name: account.accountId },
            password,
          },
        },
      },
      scope:
        scope.type === "account"
          ? { domain: { name: account.accountId } }
          : { project: { name: scope.projectName, domain: { name: account.accountId } } },
    },
  };
}

export async function getSelectelAccountToken(account: ProviderAccount, forceRefresh = false) {
  if (
    !forceRefresh &&
    account.encryptedIamToken &&
    account.iamTokenExpiresAt &&
    account.iamTokenExpiresAt > new Date(Date.now() + 60_000)
  ) {
    return decryptSecret(account.encryptedIamToken);
  }

  const password = decryptSecret(account.encryptedPassword);
  const response = await fetchWithTimeout(identityUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tokenScopeBody(account, password, { type: "account" })),
  });

  if (!response.ok) {
    throw new Error(`Selectel account auth failed: ${await readError(response)}`);
  }

  const token = response.headers.get("x-subject-token");
  if (!token) {
    throw new Error("Selectel account auth did not return X-Subject-Token");
  }

  await prisma.providerAccount.update({
    where: { id: account.id },
    data: {
      encryptedIamToken: encryptSecret(token),
      iamTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 23),
    },
  });

  return token;
}

export async function getSelectelProjectToken(account: ProviderAccount, projectName: string, forceRefresh = false) {
  const cacheKey = `${account.id}:${projectName}`;
  const cached = projectTokenCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const password = decryptSecret(account.encryptedPassword);
  const response = await fetchWithTimeout(identityUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tokenScopeBody(account, password, { type: "project", projectName })),
  });

  if (!response.ok) {
    throw new Error(`Selectel project auth failed for "${projectName}": ${await readError(response)}`);
  }

  const token = response.headers.get("x-subject-token");
  if (!token) {
    throw new Error(`Selectel project auth for "${projectName}" did not return X-Subject-Token`);
  }

  projectTokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + 1000 * 60 * 60 * 23,
  });

  return token;
}

async function selectelFetch(
  account: ProviderAccount,
  path: string,
  init: RequestInit = {},
  options: { scope?: TokenScope; retry?: boolean } = {},
) {
  const scope = options.scope ?? { type: "account" };
  const retry = options.retry ?? true;
  const token =
    scope.type === "account"
      ? await getSelectelAccountToken(account)
      : await getSelectelProjectToken(account, scope.projectName);

  const response = await fetchWithTimeout(`${vpcUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 401 && retry) {
    const freshToken =
      scope.type === "account"
        ? await getSelectelAccountToken(account, true)
        : await getSelectelProjectToken(account, scope.projectName, true);
    return fetchWithTimeout(`${vpcUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": freshToken,
        ...(init.headers ?? {}),
      },
    });
  }

  return response;
}

export async function listSelectelProjects(account: ProviderAccount) {
  const response = await selectelFetch(account, "/projects");
  if (!response.ok) {
    throw new Error(`Selectel projects failed: ${await readError(response)}`);
  }
  const payload = (await response.json()) as { projects?: SelectelProject[] };
  return payload.projects ?? [];
}

export async function getSelectelProjectDetails(account: ProviderAccount, projectId: string) {
  const response = await selectelFetch(account, `/projects/${projectId}`);
  if (!response.ok) {
    throw new Error(`Selectel project details failed: ${await readError(response)}`);
  }
  const payload = (await response.json()) as { project?: SelectelProjectDetails };
  return payload.project ?? null;
}

export function extractProjectRegions(project: SelectelProjectDetails | null) {
  const regions = new Set<string>();
  if (!project) return [];

  const addRegion = (value: unknown) => {
    if (typeof value === "string" && /^ru-\d+$/.test(value)) {
      regions.add(value);
    }
  };

  addRegion((project as Record<string, unknown>).region);
  addRegion((project as Record<string, unknown>).location);

  const collect = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    const record = value as Record<string, unknown>;
    addRegion(record.region);
    addRegion(record.location);
    for (const item of Object.values(record)) {
      if (typeof item === "object") collect(item);
    }
  };

  collect(project.quotas);

  return [...regions].sort((a, b) => a.localeCompare(b));
}

export async function allocateFloatingIp(input: {
  account: ProviderAccount;
  projectId: string;
  projectName: string;
  region: string;
  requestedIp?: string;
}) {
  const body = {
    floatingips: [
      {
        quantity: 1,
        region: input.region,
        ...(input.requestedIp ? { ips: input.requestedIp } : {}),
      },
    ],
  };

  const response = await selectelFetch(
    input.account,
    `/floatingips/projects/${input.projectId}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    { scope: { type: "project", projectName: input.projectName } },
  );

  if (!response.ok) {
    throw await buildSelectelError(response, "Selectel floating IP create failed");
  }
  const payload = await response.json();
  const floatingIp = normalizeFloatingIpPayload(payload);
  if (!floatingIp) {
    throw new Error(`Selectel floating IP create returned an unexpected payload: ${shortPayload(payload)}`);
  }
  return floatingIp;
}

export async function releaseFloatingIp(input: {
  account: ProviderAccount;
  projectName: string;
  floatingIpId: string;
}) {
  const response = await selectelFetch(
    input.account,
    `/floatingips/${input.floatingIpId}`,
    { method: "DELETE" },
    { scope: { type: "project", projectName: input.projectName } },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`Selectel floating IP delete failed: ${await readError(response)}`);
  }
}
