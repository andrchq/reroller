import { ProfileForm } from "@/components/profile-form";
import { AppShell, PageHeader } from "@/components/shell";
import { Badge, Button, Card } from "@/components/ui";
import { startProfileAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ProfilesPage() {
  await requireUser();
  const [profiles, projects] = await Promise.all([
    prisma.searchProfile.findMany({
      orderBy: { createdAt: "desc" },
      include: { providerAccount: true, projectBinding: true, targets: true, rateLimit: true },
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
  }));

  return (
    <AppShell>
      <PageHeader title="Профили" description="Целевые IP, проект, регион и лимитер фоновой задачи." />
      <div className="grid gap-4 xl:grid-cols-[1fr_28rem]">
        <Card>
          <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Список профилей</div>
          <div className="grid gap-3">
            {profiles.map((profile) => (
              <div key={profile.id} className="rounded-md border border-[var(--line)] bg-black/20 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-[#fff4d6]">{profile.name}</div>
                      <Badge>{profile.region}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-[var(--muted)]">
                      {profile.providerAccount.name} / {profile.projectBinding.name}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {profile.targets.slice(0, 6).map((target) => (
                        <span key={target.id} className="rounded bg-[#f6c453]/10 px-2 py-1 text-xs text-[#f6c453]">
                          {target.value}
                        </span>
                      ))}
                      {profile.targets.length > 6 ? <span className="rounded bg-white/5 px-2 py-1 text-xs text-[var(--muted)]">+{profile.targets.length - 6}</span> : null}
                    </div>
                  </div>
                  <form action={startProfileAction}>
                    <input type="hidden" name="profileId" value={profile.id} />
                    <Button type="submit">Запустить</Button>
                  </form>
                </div>
                <details className="mt-3 rounded-md border border-[var(--line)] bg-black/20 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-[#f6c453]">Редактировать профиль</summary>
                  <div className="mt-3">
                    <ProfileForm
                      projects={projectOptions}
                      framed={false}
                      profile={{
                        id: profile.id,
                        name: profile.name,
                        projectBindingId: profile.projectBindingId,
                        region: profile.region,
                        targets: profile.targets.map((target) => target.value).join("\n"),
                        requestsPerMinute: profile.rateLimit?.requestsPerMinute ?? 6,
                        minDelayMs: profile.rateLimit?.minDelayMs ?? 10000,
                        burst: profile.rateLimit?.burst ?? 1,
                        cooldownAfterError: profile.rateLimit?.cooldownAfterError ?? 60000,
                        maxAttempts: profile.rateLimit?.maxAttempts ?? 100,
                      }}
                    />
                  </div>
                </details>
              </div>
            ))}
            {profiles.length === 0 ? <div className="text-sm text-[var(--muted)]">Сначала синхронизируйте проект и создайте профиль.</div> : null}
          </div>
        </Card>
        <ProfileForm projects={projectOptions} />
      </div>
    </AppShell>
  );
}
