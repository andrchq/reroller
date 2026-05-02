import { AccountForm } from "@/components/account-form";
import { ProfileForm } from "@/components/profile-form";
import { AppShell, PageHeader } from "@/components/shell";
import { SyncProjectsButton } from "@/components/sync-projects-button";
import { Badge, Button, Card, ListCard, PageNotice, SectionHeader } from "@/components/ui";
import { cleanupSelectelProfileIpsAction, deleteAccountAction, deleteProfileAction, duplicateProfileAction, startProfileAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { providerLabel } from "@/lib/providers";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    noticeTone?: "good" | "bad" | "warn";
    noticeTitle?: string;
    noticeMessage?: string;
    noticeDetails?: string;
    cleanup?: string;
    cleanupError?: string;
  }>;
}) {
  await requireUser();
  const params = await searchParams;
  const [accounts, profiles, projects] = await Promise.all([
    prisma.providerAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: { projects: { include: { regions: true } } },
    }),
    prisma.searchProfile.findMany({
      orderBy: { createdAt: "desc" },
      include: { providerAccount: true, projectBinding: true, selectedRegions: true, targets: true, rateLimit: true },
    }),
    prisma.projectBinding.findMany({
      orderBy: { createdAt: "desc" },
      include: { providerAccount: true, regions: { orderBy: { name: "asc" } } },
    }),
  ]);

  const projectOptions = projects.map((project) => ({
    id: project.id,
    label: `${project.providerAccount.name} / ${project.name}`,
    regions: project.regions.map((region) => region.name),
    provider: project.providerAccount.provider,
  }));

  return (
    <AppShell>
      <PageHeader
        title="Аккаунты и профили"
        description="Единый пошаговый сценарий: добавить провайдера, синхронизировать проекты и зоны, затем сразу создать профиль-задачу."
      />
      {params?.noticeTitle ? (
        <PageNotice
          tone={params.noticeTone ?? "good"}
          title={params.noticeTitle}
          message={params.noticeMessage}
          details={params.noticeDetails}
        />
      ) : null}
      {params?.cleanup ? <PageNotice title="Очистка Selectel завершена" message={params.cleanup} /> : null}
      {params?.cleanupError ? <PageNotice tone="bad" title="Действие не выполнено" message={params.cleanupError} /> : null}

      <div className="grid gap-4">
        <Card>
          <SectionHeader title="1. Подключить провайдера" description="Добавьте Selectel, Timeweb Cloud или Reg.ru. Секреты сохраняются зашифрованно." />
          <AccountForm framedTitle={false} />
        </Card>

        <Card>
          <SectionHeader title="2. Синхронизировать проекты и зоны" description="После сохранения аккаунта нажмите синхронизацию. Без проектов профиль создать нельзя." />
          <div className="grid gap-3 xl:grid-cols-2">
            {accounts.map((account) => (
              <ListCard key={account.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-white">{account.name}</div>
                      <Badge>{providerLabel(account.provider)}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-[var(--muted)]">
                      {account.provider === "selectel" ? `ID: ${account.accountId} / user: ${account.username}` : "API token сохранен и зашифрован"}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">Проектов: {account.projects.length}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SyncProjectsButton accountId={account.id} />
                    <form action={deleteAccountAction}>
                      <input type="hidden" name="accountDbId" value={account.id} />
                      <Button type="submit" className="bg-red-500/90 text-white hover:bg-red-400">
                        Удалить
                      </Button>
                    </form>
                  </div>
                </div>
                {account.projects.length > 0 ? (
                  <div className="mt-3 grid gap-1.5 text-xs leading-5 text-[var(--muted)]">
                    {account.projects.map((project) => (
                      <div key={project.id} className="min-w-0">
                        <span className="text-white">{project.name}:</span>{" "}
                        <span className="break-words">
                          {project.regions.length > 0 ? project.regions.map((region) => region.name).join(", ") : "зон нет"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <details className="mt-3 rounded-xl border border-[var(--line)] bg-white/[0.025] p-3">
                  <summary className="cursor-pointer text-sm font-medium text-white">Редактировать аккаунт</summary>
                  <div className="mt-3">
                    <AccountForm
                      framedTitle={false}
                      account={{
                        id: account.id,
                        name: account.name,
                        provider: account.provider as "selectel" | "timeweb" | "regru",
                        accountId: account.accountId,
                        username: account.username,
                      }}
                    />
                  </div>
                </details>
              </ListCard>
            ))}
            {accounts.length === 0 ? <div className="text-sm text-[var(--muted)]">Сначала добавьте аккаунт провайдера.</div> : null}
          </div>
        </Card>

        <Card>
          <SectionHeader title="3. Создать профиль-задачу" description="Выберите синхронизированный проект, зоны, целевые IP/CIDR и лимиты работы." />
          <ProfileForm projects={projectOptions} framed={false} />
        </Card>

        <Card>
          <SectionHeader title="Созданные профили" description="Профили редактируются здесь, а запускаются и контролируются на странице «Задачи»." />
          <div className="grid gap-3 xl:grid-cols-2">
            {profiles.map((profile) => {
              const selectedRegions = profile.selectedRegions.length > 0 ? profile.selectedRegions.map((region) => region.name) : [profile.region];
              return (
                <ListCard key={profile.id}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-white">{profile.name}</div>
                        <Badge>{providerLabel(profile.providerAccount.provider)}</Badge>
                        {selectedRegions.slice(0, 4).map((region) => (
                          <Badge key={region}>{region}</Badge>
                        ))}
                      </div>
                      <div className="mt-1 text-sm text-[var(--muted)]">
                        {profile.providerAccount.name} / {profile.projectBinding.name}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {profile.targets.slice(0, 6).map((target) => (
                          <span key={target.id} className="rounded-lg border border-white/10 bg-white/[0.055] px-2 py-1 text-xs text-zinc-200">
                            {target.value}
                          </span>
                        ))}
                        {profile.targets.length > 6 ? <span className="rounded-lg bg-white/5 px-2 py-1 text-xs text-[var(--muted)]">+{profile.targets.length - 6}</span> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={startProfileAction}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <Button type="submit">Запустить</Button>
                      </form>
                      <form action={duplicateProfileAction}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <Button type="submit" className="border border-[var(--line)] bg-transparent text-white hover:bg-white/[0.075]">
                          Дублировать
                        </Button>
                      </form>
                      {profile.providerAccount.provider === "selectel" ? (
                        <form action={cleanupSelectelProfileIpsAction}>
                          <input type="hidden" name="profileId" value={profile.id} />
                          <Button type="submit" className="border border-red-400/30 bg-red-400/10 text-red-100 hover:bg-red-400/20">
                            Очистить IP
                          </Button>
                        </form>
                      ) : null}
                      <form action={deleteProfileAction}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <Button type="submit" className="bg-red-500/90 text-white hover:bg-red-400">
                          Удалить
                        </Button>
                      </form>
                    </div>
                  </div>
                  <details className="mt-3 rounded-xl border border-[var(--line)] bg-white/[0.025] p-3">
                    <summary className="cursor-pointer text-sm font-medium text-white">Редактировать профиль</summary>
                    <div className="mt-3">
                      <ProfileForm
                        projects={projectOptions}
                        framed={false}
                        profile={{
                          id: profile.id,
                          name: profile.name,
                          projectBindingId: profile.projectBindingId,
                          region: profile.region,
                          regions: selectedRegions,
                          targets: profile.targets.map((target) => target.value).join("\n"),
                          requestsPerMinute: profile.rateLimit?.requestsPerMinute ?? 6,
                          minDelaySeconds: profile.rateLimit?.minDelaySeconds ?? 10,
                          maxDelaySeconds: profile.rateLimit?.maxDelaySeconds ?? 30,
                          errorDelaySeconds: profile.rateLimit?.errorDelaySeconds ?? 60,
                          maxRuntimeSeconds: profile.rateLimit?.maxRuntimeSeconds ?? 3600,
                          maxFindings: profile.rateLimit?.maxFindings ?? 1,
                          serverWaitIntervalSeconds: profile.rateLimit?.serverWaitIntervalSeconds ?? 10,
                          serverWaitMaxSeconds: profile.rateLimit?.serverWaitMaxSeconds ?? 240,
                          restMinMinutes: profile.rateLimit?.restMinMinutes ?? 10,
                          restMaxMinutes: profile.rateLimit?.restMaxMinutes ?? 20,
                        }}
                      />
                    </div>
                  </details>
                </ListCard>
              );
            })}
            {profiles.length === 0 ? <div className="text-sm text-[var(--muted)]">После синхронизации создайте первый профиль.</div> : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
