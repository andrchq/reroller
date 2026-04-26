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
const projectAuthCache = new Map<string, { token: string; networkUrls: string[]; expiresAt: number }>();

export const defaultSelectelRegions = ["ru-2", "ru-6", "ru-7", "gis-1", "ru-1", "ru-3", "ru-9", "gis-2"];

export type SelectelFloatingIp = {
  id: string;
  floating_ip_address: string;
  fixed_ip_address?: string;
  project_id: string;
  region: string;
  status: string;
};

export type SelectelSubnet = {
  id: string;
  subnet_id: string;
  network_id: string;
  project_id: string;
  region: string;
  cidr: string;
  name: string;
  status: string;
  servers: Array<{ id?: string; name?: string; status?: string }>;
};

type OpenStackRouter = {
  id: string;
  name?: string;
  project_id?: string;
  tenant_id?: string;
};

type OpenStackPort = {
  id: string;
  device_id?: string;
  device_owner?: string;
  network_id?: string;
  project_id?: string;
  tenant_id?: string;
};

type OpenStackNetwork = {
  id: string;
  name?: string;
  project_id?: string;
  tenant_id?: string;
  "router:external"?: boolean;
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

export function normalizeFloatingIpListPayload(payload: unknown): SelectelFloatingIp[] {
  const root = asRecord(payload);
  if (!root) return [];

  const rawItems = Array.isArray(root.floatingips)
    ? root.floatingips
    : Array.isArray(root.floating_ips)
      ? root.floating_ips
      : Array.isArray(root)
        ? root
        : [];

  return rawItems.map((item) => normalizeFloatingIpPayload(item)).filter((item): item is SelectelFloatingIp => Boolean(item));
}

export function normalizeSubnetListPayload(payload: unknown): SelectelSubnet[] {
  const root = asRecord(payload);
  if (!root) return [];
  const rawItems = Array.isArray(root.subnets) ? root.subnets : [];

  return rawItems.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];

    const id = String(record.id ?? record.subnet_id ?? "");
    const subnetId = pickString(record, ["subnet_id"]) || id;
    const networkId = pickString(record, ["network_id"]);
    const projectId = pickString(record, ["project_id", "project"]);
    if (!id || !subnetId || !networkId) return [];

    return [
      {
        id,
        subnet_id: subnetId,
        network_id: networkId,
        project_id: projectId,
        region: pickString(record, ["region"]),
        cidr: pickString(record, ["cidr"]),
        name: pickString(record, ["name"]),
        status: pickString(record, ["status"]) || "UNKNOWN",
        servers: Array.isArray(record.servers) ? (record.servers as SelectelSubnet["servers"]) : [],
      },
    ];
  });
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

async function getSelectelProjectAuth(account: ProviderAccount, projectName: string, forceRefresh = false) {
  const cacheKey = `${account.id}:${projectName}:auth`;
  const cached = projectAuthCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) return cached;

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

  const payload = (await response.json()) as {
    token?: {
      catalog?: Array<{
        type?: string;
        name?: string;
        endpoints?: Array<{ interface?: string; url?: string }>;
      }>;
    };
  };
  const networkUrls = [
    ...new Set(
      (payload.token?.catalog ?? [])
        .filter((service) => service.type === "network" || service.name?.toLowerCase() === "neutron")
        .flatMap((service) => service.endpoints ?? [])
        .filter((endpoint) => !endpoint.interface || endpoint.interface === "public")
        .map((endpoint) => endpoint.url?.replace(/\/$/, ""))
        .filter((url): url is string => Boolean(url)),
    ),
  ];
  const auth = { token, networkUrls, expiresAt: Date.now() + 1000 * 60 * 60 * 23 };
  projectAuthCache.set(cacheKey, auth);
  projectTokenCache.set(`${account.id}:${projectName}`, { token, expiresAt: auth.expiresAt });
  return auth;
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

export async function listFloatingIps(input: {
  account: ProviderAccount;
  projectId: string;
  projectName: string;
}) {
  const response = await selectelFetch(
    input.account,
    `/floatingips/projects/${input.projectId}`,
    { method: "GET" },
    { scope: { type: "project", projectName: input.projectName } },
  );

  if (!response.ok) {
    throw await buildSelectelError(response, "Selectel floating IP list failed");
  }

  return normalizeFloatingIpListPayload(await response.json());
}

export async function listSubnets(input: {
  account: ProviderAccount;
  projectId: string;
  projectName: string;
}) {
  const response = await selectelFetch(
    input.account,
    "/subnets?detailed=true",
    { method: "GET" },
    { scope: { type: "project", projectName: input.projectName } },
  );

  if (!response.ok) {
    throw await buildSelectelError(response, "Selectel subnet list failed");
  }

  return normalizeSubnetListPayload(await response.json()).filter((subnet) => !subnet.project_id || subnet.project_id === input.projectId);
}

export async function deleteSubnet(input: {
  account: ProviderAccount;
  projectName: string;
  subnetId: string;
}) {
  const response = await selectelFetch(
    input.account,
    `/subnets/${input.subnetId}`,
    { method: "DELETE" },
    { scope: { type: "project", projectName: input.projectName } },
  );
  if (!response.ok && response.status !== 404) {
    throw await buildSelectelError(response, "Selectel subnet delete failed");
  }
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

async function openStackFetch(input: {
  account: ProviderAccount;
  projectName: string;
  url: string;
  init?: RequestInit;
}) {
  const auth = await getSelectelProjectAuth(input.account, input.projectName);
  if (auth.networkUrls.length === 0) {
    throw new Error("Selectel project auth did not return OpenStack network endpoint");
  }

  const response = await fetchWithTimeout(input.url, {
    ...(input.init ?? {}),
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": auth.token,
      ...(input.init?.headers ?? {}),
    },
  });
  return response;
}

async function openStackJson<T>(input: {
  account: ProviderAccount;
  projectName: string;
  baseUrl: string;
  path: string;
}) {
  const response = await openStackFetch({
    account: input.account,
    projectName: input.projectName,
    url: neutronUrl(input.baseUrl, input.path),
  });
  if (!response.ok) throw new Error(`OpenStack network request failed: ${await readError(response)}`);
  return (await response.json()) as T;
}

function neutronUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedPath = path.replace(/^\//, "");
  return normalizedBase.endsWith("/v2.0")
    ? `${normalizedBase}/${normalizedPath.replace(/^v2\.0\//, "")}`
    : `${normalizedBase}/${normalizedPath}`;
}

export async function cleanupSelectelOpenStackNetworkResources(input: {
  account: ProviderAccount;
  projectId: string;
  projectName: string;
  networkIds: string[];
}) {
  const auth = await getSelectelProjectAuth(input.account, input.projectName);
  const networkIds = new Set(input.networkIds.filter(Boolean));
  const result = { routerPortsDeleted: 0, routersDeleted: 0, networksDeleted: 0, skipped: 0 };

  if (auth.networkUrls.length === 0) return result;

  for (const baseUrl of auth.networkUrls) {
    const [routersPayload, portsPayload, networksPayload] = await Promise.all([
      openStackJson<{ routers?: OpenStackRouter[] }>({ account: input.account, projectName: input.projectName, baseUrl, path: "/v2.0/routers" }).catch(() => ({ routers: [] })),
      openStackJson<{ ports?: OpenStackPort[] }>({ account: input.account, projectName: input.projectName, baseUrl, path: "/v2.0/ports" }).catch(() => ({ ports: [] })),
      openStackJson<{ networks?: OpenStackNetwork[] }>({ account: input.account, projectName: input.projectName, baseUrl, path: "/v2.0/networks" }).catch(() => ({ networks: [] })),
    ]);

    const projectRouters = (routersPayload.routers ?? []).filter((router) => (router.project_id ?? router.tenant_id) === input.projectId);
    const projectPorts = (portsPayload.ports ?? []).filter((port) => (port.project_id ?? port.tenant_id) === input.projectId);
    const networkRouterPorts = projectPorts.filter(
      (port) => port.device_owner === "network:router_interface" && port.device_id && port.network_id && networkIds.has(port.network_id),
    );

    for (const port of networkRouterPorts) {
      const response = await openStackFetch({
        account: input.account,
        projectName: input.projectName,
        url: neutronUrl(baseUrl, `/v2.0/routers/${port.device_id}/remove_router_interface`),
        init: { method: "PUT", body: JSON.stringify({ port_id: port.id }) },
      });
      if (response.ok || response.status === 404) result.routerPortsDeleted += 1;
      else result.skipped += 1;
    }

    for (const router of projectRouters) {
      const remainingPorts = projectPorts.filter((port) => port.device_id === router.id && !networkRouterPorts.some((removed) => removed.id === port.id));
      if (remainingPorts.length > 0) {
        result.skipped += 1;
        continue;
      }
      const response = await openStackFetch({
        account: input.account,
        projectName: input.projectName,
        url: neutronUrl(baseUrl, `/v2.0/routers/${router.id}`),
        init: { method: "DELETE" },
      });
      if (response.ok || response.status === 404 || response.status === 204) result.routersDeleted += 1;
      else result.skipped += 1;
    }

    const projectNetworks = (networksPayload.networks ?? []).filter(
      (network) => (network.project_id ?? network.tenant_id) === input.projectId && !network["router:external"] && networkIds.has(network.id),
    );
    for (const network of projectNetworks) {
      const response = await openStackFetch({
        account: input.account,
        projectName: input.projectName,
        url: neutronUrl(baseUrl, `/v2.0/networks/${network.id}`),
        init: { method: "DELETE" },
      });
      if (response.ok || response.status === 404 || response.status === 204) result.networksDeleted += 1;
      else result.skipped += 1;
    }
  }

  return result;
}
