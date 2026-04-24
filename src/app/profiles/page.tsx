import { AppShell, PageHeader } from "@/components/shell";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { createProfileAction, startProfileAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ProfilesPage() {
  await requireUser();
  const [profiles, projects] = await Promise.all([
    prisma.searchProfile.findMany({
      orderBy: { createdAt: "desc" },
      include: { providerAccount: true, projectBinding: true, targets: true, rateLimit: true },
    }),
    prisma.projectBinding.findMany({ orderBy: { createdAt: "desc" }, include: { providerAccount: true } }),
  ]);

  return (
    <AppShell>
      <PageHeader title="Профили" description="Целевые IP, регион, проект и лимитер фоновой задачи." />
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
                        <span key={target.id} className="rounded bg-[#f6c453]/10 px-2 py-1 text-xs text-[#f6c453]">{target.value}</span>
                      ))}
                    </div>
                  </div>
                  <form action={startProfileAction}>
                    <input type="hidden" name="profileId" value={profile.id} />
                    <Button type="submit">Запустить</Button>
                  </form>
                </div>
              </div>
            ))}
            {profiles.length === 0 ? <div className="text-sm text-[var(--muted)]">Сначала синхронизируйте проект и создайте профиль.</div> : null}
          </div>
        </Card>
        <Card>
          <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Новый профиль</div>
          <form action={createProfileAction} className="grid gap-3">
            <Field label="Название">
              <Input name="name" required placeholder="Пул ru-1" />
            </Field>
            <Field label="Проект">
              <Select name="projectBindingId" required>
                <option value="">Выберите проект</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.providerAccount.name} / {project.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Регион">
              <Input name="region" required placeholder="ru-1" />
            </Field>
            <Field label="Целевые IP или CIDR, по одному в строке">
              <Textarea name="targets" required placeholder={"203.0.113.10\n198.51.100.0/24"} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Запросов в минуту">
                <Input name="requestsPerMinute" type="number" defaultValue={6} min={1} />
              </Field>
              <Field label="Мин. задержка, мс">
                <Input name="minDelayMs" type="number" defaultValue={10000} min={1000} />
              </Field>
              <Field label="Пакет запросов">
                <Input name="burst" type="number" defaultValue={1} min={1} />
              </Field>
              <Field label="Пауза после ошибки, мс">
                <Input name="cooldownAfterError" type="number" defaultValue={60000} min={1000} />
              </Field>
              <Field label="Макс. попыток">
                <Input name="maxAttempts" type="number" defaultValue={100} min={1} />
              </Field>
            </div>
            <Button type="submit" disabled={projects.length === 0}>Создать профиль</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
