import type { ProviderAccount } from "@prisma/client";
import { releaseFloatingIp } from "@/lib/selectel";
import { releaseTimewebFloatingIp } from "@/lib/timeweb";

export async function releaseProviderFloatingIp(input: {
  account: ProviderAccount;
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

  await releaseFloatingIp({
    account: input.account,
    projectName: input.projectName,
    floatingIpId: input.floatingIpId,
  });
}
