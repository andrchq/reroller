import { LiveRunLogs } from "@/components/live-run-logs";
import { AppShell, PageHeader } from "@/components/shell";
import { Badge, Button, Card, LinkButton } from "@/components/ui";
import { continueRunAction, startProfileAction, stopProfileRunsAction, stopRunAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { runStatusLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

const compactHistoryLimit = 5;
const pageSize = 30;

function pageLink(input: { runId?: string; history?: string; page?: number }) {
  const params = new URLSearchParams();
  if (input.runId) params.set("run", input.runId);
  if (input.history) params.set("history", input.history);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return query ? `/tasks?${query}` : "/tasks";
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; history?: string; page?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const showAllHistory = params.history === "all";
  const currentPage = Math.max(1, Number(params.page) || 1);
  const historyTake = showAllHistory ? pageSize : compactHistoryLimit;
  const historySkip = showAllHistory ? (currentPage - 1) * pageSize : 0;

  const [profiles, runs, totalRuns] = await Promise.all([
    prisma.searchProfile.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        providerAccount: true,
        projectBinding: true,
        selectedRegions: true,
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    }),
    prisma.run.findMany({
      orderBy: { createdAt: "desc" },
      skip: historySkip,
      take: historyTake,
      include: { searchProfile: true, logs: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.run.count(),
  ]);
  const selected =
    runs.find((run) => run.id === params.run) ??
    (params.run
      ? await prisma.run.findUnique({
          where: { id: params.run },
          include: { searchProfile: true, logs: { orderBy: { createdAt: "asc" } } },
        })
      : null) ??
    runs[0] ??
    null;
  const totalPages = Math.max(1, Math.ceil(totalRuns / pageSize));

  return (
    <AppShell>
      <PageHeader title="Задачи" description="Управление профилями парсинга, запуском, остановкой и логами выполнения." />
      <div className="grid gap-4 xl:grid-cols-[28rem_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Профили-задачи</div>
            <div className="grid gap-3">
              {profiles.map((profile) => {
                const lastRun = profile.runs[0] ?? null;
                const activeRun = profile.runs.find((run) => ["QUEUED", "RUNNING"].includes(run.status));
                const isActive = Boolean(activeRun);
                const regions = profile.selectedRegions.length > 0 ? profile.selectedRegions.map((region) => region.name).join(", ") : profile.region;
                return (
                  <div key={profile.id} className="rounded-md border border-[var(--line)] bg-black/20 p-3">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-[#fff4d6]">{profile.name}</div>
                        <div className="mt-1 text-xs text-[var(--muted)]">
                          {profile.providerAccount.name} / {profile.projectBinding.name} / {regions}
                        </div>
                      </div>
                      {lastRun ? (
                        <Badge tone={lastRun.status === "FAILED" ? "bad" : lastRun.status === "COMPLETED" ? "good" : "default"}>
                          {runStatusLabel(lastRun.status, lastRun.failureReason)}
                        </Badge>
                      ) : (
                        <Badge>Не запускалась</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={startProfileAction}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <Button type="submit" disabled={isActive}>
                          Запустить
                        </Button>
                      </form>
                      <form action={stopProfileRunsAction}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <Button type="submit" disabled={!isActive} className="bg-red-300 hover:bg-red-200">
                          Остановить
                        </Button>
                      </form>
                      {lastRun ? (
                        <a href={pageLink({ runId: lastRun.id, history: showAllHistory ? "all" : undefined, page: currentPage })} className="inline-flex h-9 items-center rounded-md border border-[var(--line)] px-3 text-sm text-[#f6c453] hover:bg-[#f6c453]/10">
                          Логи
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {profiles.length === 0 ? <div className="text-sm text-[var(--muted)]">Профилей пока нет. Создайте профиль на странице «Профили».</div> : null}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[#fff4d6]">История запусков</div>
              {!showAllHistory && totalRuns > compactHistoryLimit ? (
                <LinkButton href={pageLink({ runId: selected?.id, history: "all" })}>Еще</LinkButton>
              ) : null}
            </div>
            <div className="grid gap-2">
              {runs.map((run) => (
                <a key={run.id} href={pageLink({ runId: run.id, history: showAllHistory ? "all" : undefined, page: currentPage })} className="rounded-md border border-[var(--line)] bg-black/20 p-3 hover:bg-[#f6c453]/10">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{run.searchProfile.name}</span>
                    <Badge tone={run.status === "FAILED" ? "bad" : run.status === "COMPLETED" ? "good" : "default"}>
                      {runStatusLabel(run.status, run.failureReason)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">Попыток: {run.attempts} / {run.createdAt.toLocaleString("ru-RU")}</div>
                </a>
              ))}
              {runs.length === 0 ? <div className="text-sm text-[var(--muted)]">Запусков пока нет.</div> : null}
            </div>
            {showAllHistory ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <LinkButton href={pageLink({ runId: selected?.id })}>Свернуть</LinkButton>
                <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <LinkButton href={pageLink({ runId: selected?.id, history: "all", page: currentPage - 1 })} aria-disabled={currentPage <= 1} className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}>
                    Назад
                  </LinkButton>
                  <span>
                    {currentPage} / {totalPages}
                  </span>
                  <LinkButton href={pageLink({ runId: selected?.id, history: "all", page: currentPage + 1 })} aria-disabled={currentPage >= totalPages} className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}>
                    Вперед
                  </LinkButton>
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        <Card>
          {selected ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#fff4d6]">{selected.searchProfile.name}</div>
                  <div className="text-xs text-[var(--muted)]">ID запуска: {selected.id}</div>
                </div>
                {["QUEUED", "RUNNING"].includes(selected.status) ? (
                  <form action={stopRunAction}>
                    <input type="hidden" name="runId" value={selected.id} />
                    <Button type="submit" className="bg-red-300 hover:bg-red-200">
                      Остановить
                    </Button>
                  </form>
                ) : (
                  <form action={continueRunAction}>
                    <input type="hidden" name="runId" value={selected.id} />
                    <Button type="submit">Продолжить поиск</Button>
                  </form>
                )}
              </div>
              <LiveRunLogs
                key={selected.id}
                runId={selected.id}
                initialLogs={selected.logs.map((log) => ({
                  id: log.id,
                  level: log.level,
                  message: log.message,
                  createdAt: log.createdAt.toISOString(),
                }))}
              />
            </>
          ) : (
            <div className="text-sm text-[var(--muted)]">Выберите запуск.</div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
