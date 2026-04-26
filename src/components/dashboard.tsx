import { AppShell, PageHeader } from "@/components/shell";
import { Badge, Card, SectionHeader } from "@/components/ui";
import { logLevelLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export async function Dashboard() {
  const [accounts, profiles, activeRuns, findings, logs] = await Promise.all([
    prisma.providerAccount.count(),
    prisma.searchProfile.count(),
    prisma.run.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }),
    prisma.finding.count(),
    prisma.runLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { run: { include: { searchProfile: true } } },
    }),
  ]);

  return (
    <AppShell>
      <PageHeader title="Обзор" description="Краткое состояние парсера и последних фоновых задач." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Аккаунты" value={accounts} />
        <Stat label="Профили" value={profiles} />
        <Stat label="Активные запуски" value={activeRuns} />
        <Stat label="Находки" value={findings} />
      </div>
      <Card className="mt-4">
        <SectionHeader title="Последние логи" description="Свежие события фоновых задач." />
        <div className="grid gap-2">
          {logs.map((log) => (
            <div key={log.id} className="grid gap-2 rounded-md bg-black/20 p-3 text-sm md:grid-cols-[8rem_1fr_10rem]">
              <Badge tone={log.level === "ERROR" ? "bad" : log.level === "SUCCESS" ? "good" : "default"}>
                {logLevelLabel(log.level)}
              </Badge>
              <span>{log.message}</span>
              <span className="text-xs text-[var(--muted)]">{log.createdAt.toLocaleString("ru-RU")}</span>
            </div>
          ))}
          {logs.length === 0 ? <div className="text-sm text-[var(--muted)]">Логов пока нет.</div> : null}
        </div>
      </Card>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-[#f6c453]">{value}</div>
    </Card>
  );
}
