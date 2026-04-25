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

async function readTimewebError(response: Response) {
  const text = await response.text();
  if (!text) return `${response.status} ${response.statusText}`;
  try {
    const payload = JSON.parse(text) as { error_code?: string; message?: string | string[] };
    const message = Array.isArray(payload.message) ? payload.message.join("; ") : payload.message;
    return `${response.status} ${response.statusText}: ${payload.error_code ?? "error"}${message ? `: ${message}` : ""}`;
  } catch {
    return `${response.status} ${response.statusText}: ${text}`;
  }
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
  if (!response.ok) throw new Error(`Timeweb projects failed: ${await readTimewebError(response)}`);
  const payload = (await response.json()) as { projects?: TimewebProject[] };
  return payload.projects ?? [];
}

export async function listTimewebZones(account: ProviderAccount) {
  const response = await timewebFetch(account, "/api/v2/locations");
  if (!response.ok) throw new Error(`Timeweb locations failed: ${await readTimewebError(response)}`);
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
  if (!response.ok) throw new Error(`Timeweb floating IP create failed: ${await readTimewebError(response)}`);
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
    throw new Error(`Timeweb floating IP delete failed: ${await readTimewebError(response)}`);
  }
}
