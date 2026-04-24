import type { ProviderAccount } from "@prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

const identityUrl = "https://cloud.api.selcloud.ru/identity/v3/auth/tokens";
const vpcUrl = "https://api.selectel.ru/vpc/resell/v2";

type SelectelProject = {
  id: string;
  name: string;
  url?: string;
};

type SelectelProjectDetails = SelectelProject & {
  quotas?: Record<string, Array<{ region?: string; zone?: string; value?: number; used?: number }>>;
};

export type SelectelFloatingIp = {
  id: string;
  floating_ip_address: string;
  fixed_ip_address?: string;
  project_id: string;
  region: string;
  status: string;
};

async function readError(response: Response) {
  const text = await response.text();
  return `${response.status} ${response.statusText}${text ? `: ${text}` : ""}`;
}

export async function getSelectelToken(account: ProviderAccount, forceRefresh = false) {
  if (
    !forceRefresh &&
    account.encryptedIamToken &&
    account.iamTokenExpiresAt &&
    account.iamTokenExpiresAt > new Date(Date.now() + 60_000)
  ) {
    return decryptSecret(account.encryptedIamToken);
  }

  const password = decryptSecret(account.encryptedPassword);
  const body = {
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
      scope: { domain: { name: account.accountId } },
    },
  };

  const response = await fetch(identityUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Selectel auth failed: ${await readError(response)}`);
  }

  const token = response.headers.get("x-subject-token");
  if (!token) {
    throw new Error("Selectel auth did not return X-Subject-Token");
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

async function selectelFetch(account: ProviderAccount, path: string, init: RequestInit = {}, retry = true) {
  const token = await getSelectelToken(account);
  const response = await fetch(`${vpcUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 401 && retry) {
    const freshToken = await getSelectelToken(account, true);
    return fetch(`${vpcUrl}${path}`, {
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
  if (!project?.quotas) return [];

  for (const quotaItems of Object.values(project.quotas)) {
    if (!Array.isArray(quotaItems)) continue;
    for (const quota of quotaItems) {
      if (quota.region) {
        regions.add(quota.region);
      }
    }
  }

  return [...regions].sort((a, b) => a.localeCompare(b));
}

export async function allocateFloatingIp(input: {
  account: ProviderAccount;
  projectId: string;
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

  const response = await selectelFetch(input.account, `/floatingips/projects/${input.projectId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Selectel floating IP create failed: ${await readError(response)}`);
  }
  const payload = (await response.json()) as { floatingip?: SelectelFloatingIp };
  if (!payload.floatingip?.id || !payload.floatingip.floating_ip_address) {
    throw new Error("Selectel floating IP create returned an unexpected payload");
  }
  return payload.floatingip;
}

export async function releaseFloatingIp(account: ProviderAccount, floatingIpId: string) {
  const response = await selectelFetch(account, `/floatingips/${floatingIpId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Selectel floating IP delete failed: ${await readError(response)}`);
  }
}
