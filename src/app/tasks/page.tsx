import { Pause, Play, Square } from "lucide-react";
import { LiveRunLogs } from "@/components/live-run-logs";
import { AppShell, PageHeader } from "@/components/shell";
import { Badge, Button, Card, Field, Input, PageNotice, Select } from "@/components/ui";
import { bulkProfilesAction, pauseProfileAction, startProfileAction, stopProfileRunsAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { runStatusLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { providerLabel } from "@/lib/providers";

function taskRank(profile: {
  enabled: boolean;
  runs: Array<{ status: string; failureReason: string | null }>;
}) {
  const lastRun = profile.runs[0] ?? null;
  const hasActive = profile.runs.some((run) => ["QUEUED", "RUNNING"].includes(run.status));
  if (lastRun?.status === "FAILED") return 0;
  if (!profile.enabled) return 1;
  if (!hasActive) return 2;
  return 3;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; run?: string; deleteNotice?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const [profilesRaw, projects] = await Promise.all([
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
    prisma.projectBinding.findMany({
      orderBy: { createdAt: "desc" },
      include: { providerAccount: true, regions: { orderBy: { name: "asc" } } },
    }),
  ]);

  const profiles = [...profilesRaw].sort((a, b) => taskRank(a) - taskRank(b) || a.name.localeCompare(b.name));
  const selectedProfile =
    profiles.find((profile) => profile.id === params.profile) ??
    profiles.find((profile) => profile.runs.some((run) => run.id === params.run)) ??
    profiles[0] ??
    null;
  const selectedRunId = params.run ?? selectedProfile?.runs[0]?.id ?? null;
  const selectedRun = selectedRunId
    ? await prisma.run.findUnique({
        where: { id: selectedRunId },
        include: { searchProfile: true, logs: { orderBy: { createdAt: "asc" } } },
      })
    : null;
  const selectedRegions = selectedProfile
    ? selectedProfile.selectedRegions.length > 0
      ? selectedProfile.selectedRegions.map((region) => region.name)
      : [selectedProfile.region]
    : [];

  return (
    <AppShell>
      <PageHeader title="Задачи" description="Компактное управление профилями, массовые изменения и live-логи выбранной задачи." />
      {params.deleteNotice ? <PageNotice tone="warn" title="Системное сообщение" message={params.deleteNotice} /> : null}

      <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
        <Card className="xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Лента задач</div>
              <div className="text-xs text-[var(--muted)]">Ошибки, паузы, остановленные, запущенные</div>
            </div>
            <Badge>{profiles.length}</Badge>
          </div>
          <div className="h-[calc(100vh-8.5rem)] overflow-y-auto pr-1">
            <div className="grid gap-2">
              {profiles.map((profile) => {
                const lastRun = profile.runs[0] ?? null;
                const activeRun = profile.runs.find((run) => ["QUEUED", "RUNNING"].includes(run.status));
                const isActive = Boolean(activeRun);
                const isSelected = selectedProfile?.id === profile.id;
                const tone = lastRun?.status === "FAILED" ? "bad" : isActive ? "good" : "default";
                const href = lastRun ? `/tasks?profile=${profile.id}&run=${lastRun.id}` : `/tasks?profile=${profile.id}`;

                return (
                  <div
                    key={profile.id}
                    className={[
                      "rounded-xl border p-2 transition",
                      isSelected ? "border-white/30 bg-white/[0.075]" : "border-[var(--line)] bg-white/[0.025] hover:bg-white/[0.055]",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        form="bulk-profile-form"
                        type="checkbox"
                        name="profileIds"
                        value={profile.id}
                        className="mt-1 h-4 w-4 accent-white"
                        aria-label={`Выбрать ${profile.name}`}
                      />
                      <a href={href} className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">{profile.name}</div>
                        <div className="mt-1 flex items-center gap-1">
                          {!profile.enabled ? (
                            <Badge>Пауза</Badge>
                          ) : lastRun ? (
                            <Badge tone={tone}>{runStatusLabel(lastRun.status, lastRun.failureReason)}</Badge>
                          ) : (
                            <Badge>Стоп</Badge>
                          )}
                        </div>
                      </a>
                    </div>
                    <div className="mt-2 flex gap-1.5 pl-6">
                      <form action={startProfileAction}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <IconButton title="Запустить" disabled={isActive}>
                          <Play size={15} />
                        </IconButton>
                      </form>
                      <form action={pauseProfileAction}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <IconButton title="Пауза" disabled={!profile.enabled && !isActive}>
                          <Pause size={15} />
                        </IconButton>
                      </form>
                      <form action={stopProfileRunsAction}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <IconButton title="Остановить" disabled={!isActive} danger>
                          <Square size={14} />
                        </IconButton>
                      </form>
                    </div>
                  </div>
                );
              })}
              {profiles.length === 0 ? <div className="text-sm text-[var(--muted)]">Профилей пока нет.</div> : null}
            </div>
          </div>
        </Card>

        <div className="grid min-w-0 gap-4">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Массовое изменение</div>
                <div className="text-xs text-[var(--muted)]">Выберите задачи слева. Массовое изменение применяется только к одному хостингу.</div>
              </div>
              <Badge>bulk</Badge>
            </div>
            <form id="bulk-profile-form" action={bulkProfilesAction} className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[12rem_1fr_1fr_10rem]">
                <Field label="Действие">
                  <Select name="bulkOperation" defaultValue="update">
                    <option value="update">Изменить настройки</option>
                    <option value="start">Запустить выбранные</option>
                    <option value="pause">Поставить на паузу</option>
                    <option value="stop">Остановить выбранные</option>
                  </Select>
                </Field>
                <Field label="Новый проект">
                  <Select name="projectBindingId" defaultValue="">
                    <option value="">Не менять проект</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {providerLabel(project.providerAccount.provider)} / {project.providerAccount.name} / {project.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Зоны, если меняется проект">
                  <Input name="bulkRegions" placeholder="ru-1, ru-2 или spb-1" />
                </Field>
                <Button type="submit">Применить</Button>
              </div>
              <details className="rounded-xl border border-[var(--line)] bg-white/[0.025] p-3">
                <summary className="cursor-pointer text-sm font-medium text-white">Лимиты и расписание</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Запросов/мин">
                    <Input name="requestsPerMinute" type="number" min={1} placeholder="не менять" />
                  </Field>
                  <Field label="Мин. задержка, сек">
                    <Input name="minDelaySeconds" type="number" min={1} placeholder="не менять" />
                  </Field>
                  <Field label="Макс. задержка, сек">
                    <Input name="maxDelaySeconds" type="number" min={1} placeholder="не менять" />
                  </Field>
                  <Field label="Пауза ошибки, сек">
                    <Input name="errorDelaySeconds" type="number" min={1} placeholder="не менять" />
                  </Field>
                  <Field label="Время работы, сек">
                    <Input name="maxRuntimeSeconds" type="number" min={60} placeholder="не менять" />
                  </Field>
                  <Field label="Лимит находок">
                    <Input name="maxFindings" type="number" min={1} placeholder="не менять" />
                  </Field>
                  <Field label="Мин. отдых, мин">
                    <Input name="restMinMinutes" type="number" min={1} placeholder="не менять" />
                  </Field>
                  <Field label="Макс. отдых, мин">
                    <Input name="restMaxMinutes" type="number" min={1} placeholder="не менять" />
                  </Field>
                </div>
              </details>
            </form>
          </Card>

          <Card>
            {selectedProfile ? (
              <>
                <div className="mb-3 flex flex-col gap-3 border-b border-[var(--line)] pb-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-white">{selectedProfile.name}</div>
                    <div className="mt-1 text-sm text-[var(--muted)]">
                      {providerLabel(selectedProfile.providerAccount.provider)} / {selectedProfile.providerAccount.name} / {selectedProfile.projectBinding.name}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedRegions.map((region) => (
                        <Badge key={region}>{region}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-xs leading-5 text-[var(--muted)]">
                    {selectedRun ? (
                      <>
                        <div>ID запуска: {selectedRun.id}</div>
                        <div>Попыток: {selectedRun.attempts}</div>
                        <div>Создан: {selectedRun.createdAt.toLocaleString("ru-RU")}</div>
                      </>
                    ) : (
                      <div>У задачи еще нет запусков.</div>
                    )}
                  </div>
                </div>
                {selectedRun ? (
                  <LiveRunLogs
                    key={selectedRun.id}
                    runId={selectedRun.id}
                    initialLogs={selectedRun.logs.map((log) => ({
                      id: log.id,
                      level: log.level,
                      message: log.message,
                      createdAt: log.createdAt.toISOString(),
                    }))}
                  />
                ) : (
                  <div className="rounded-2xl border border-[var(--line)] bg-white/[0.025] p-6 text-sm text-[var(--muted)]">
                    Запустите задачу, чтобы здесь появился live-лог.
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-[var(--muted)]">Создайте профиль на странице «Аккаунты и профили».</div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function IconButton({
  children,
  title,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      title={title}
      aria-label={title}
      disabled={disabled}
      className={[
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:pointer-events-none disabled:opacity-35",
        danger
          ? "border-red-400/25 bg-red-400/10 text-red-100 hover:bg-red-400/20"
          : "border-white/10 bg-white/[0.045] text-white hover:bg-white/[0.09]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
