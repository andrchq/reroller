import { AppShell, PageHeader } from "@/components/shell";
import { Badge, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function FindingsPage() {
  await requireUser();
  const findings = await prisma.finding.findMany({
    orderBy: { createdAt: "desc" },
    include: { searchProfile: { include: { providerAccount: true, projectBinding: true } } },
  });

  return (
    <AppShell>
      <PageHeader title="Находки" description="Зарезервированные IP, которые совпали с целевым списком." />
      <Card>
        <div className="grid gap-3">
          {findings.map((finding) => (
            <div key={finding.id} className="grid gap-3 rounded-md border border-[var(--line)] bg-black/20 p-3 md:grid-cols-[1fr_12rem_10rem]">
              <div>
                <div className="text-lg font-semibold text-[#f6c453]">{finding.floatingIpAddress}</div>
                <div className="text-sm text-[var(--muted)]">
                  {finding.searchProfile.name} / {finding.searchProfile.providerAccount.name} / {finding.searchProfile.projectBinding.name}
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">ID Floating IP: {finding.floatingIpId}</div>
              </div>
              <div>
                <Badge>{finding.region}</Badge>
              </div>
              <div className="text-xs text-[var(--muted)]">{finding.createdAt.toLocaleString("ru-RU")}</div>
            </div>
          ))}
          {findings.length === 0 ? <div className="text-sm text-[var(--muted)]">Совпадений пока нет.</div> : null}
        </div>
      </Card>
    </AppShell>
  );
}
