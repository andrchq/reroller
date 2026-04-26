import type { ProviderAccount } from "@prisma/client";
import { releaseRegRuFloatingIp } from "@/lib/regru";
import { cleanupEmptySelectelNetworkResources, releaseFloatingIp } from "@/lib/selectel";
import { releaseTimewebFloatingIp } from "@/lib/timeweb";

export async function releaseProviderFloatingIp(input: {
  account: ProviderAccount;
  projectId?: string;
  projectName: string;
  floatingIpId: string;
}) {
  if (input.account.provider === "timeweb") {
    await releaseTimewebFloatingIp({
      account: input.account,
      floatingIpId: input.floatingIpId,
    });
    return;
  }

  if (input.account.provider === "regru") {
    await releaseRegRuFloatingIp({
      account: input.account,
      floatingIpId: input.floatingIpId,
    });
    return;
  }

  await releaseFloatingIp({
    account: input.account,
    projectName: input.projectName,
    floatingIpId: input.floatingIpId,
  });
  if (input.projectId) {
    return cleanupEmptySelectelNetworkResources({
      account: input.account,
      projectId: input.projectId,
      projectName: input.projectName,
    });
  }
  return undefined;
}
