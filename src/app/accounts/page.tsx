import { AppShell, PageHeader } from "@/components/shell";
import { Button, Card, Field, InfoTip, Input, Select } from "@/components/ui";
import { SyncProjectsButton } from "@/components/sync-projects-button";
import { createAccountAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { providerLabel } from "@/lib/providers";

export default async function AccountsPage() {
  await requireUser();
  const accounts = await prisma.providerAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: { projects: { include: { regions: true } } },
  });

  return (
    <AppShell>
      <PageHeader title="Аккаунты" description="Учетные данные провайдеров и синхронизация проектов/зон." />
      <div className="grid gap-4 xl:grid-cols-[1fr_24rem_22rem]">
        <Card>
          <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Список аккаунтов</div>
          <div className="grid gap-3">
            {accounts.map((account) => (
              <div key={account.id} className="rounded-md border border-[var(--line)] bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-[#fff4d6]">{account.name}</div>
                      <span className="rounded-full border border-[#f6c453]/20 bg-[#f6c453]/10 px-2 py-0.5 text-xs text-[#f6c453]">
                        {providerLabel(account.provider)}
                      </span>
                    </div>
                    {account.provider === "selectel" ? (
                      <div className="text-sm text-[var(--muted)]">ID аккаунта: {account.accountId} / Пользователь: {account.username}</div>
                    ) : (
                      <div className="text-sm text-[var(--muted)]">API token сохранен зашифрованно</div>
                    )}
                    <div className="mt-1 text-xs text-[var(--muted)]">Проектов: {account.projects.length}</div>
                  </div>
                  <SyncProjectsButton accountId={account.id} />
                </div>
                {account.projects.length > 0 ? (
                  <div className="mt-3 grid gap-1 text-xs text-[var(--muted)]">
                    {account.projects.map((project) => (
                      <div key={project.id}>
                        {project.name}: {project.regions.length > 0 ? project.regions.map((region) => region.name).join(", ") : "зон нет"}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {accounts.length === 0 ? <div className="text-sm text-[var(--muted)]">Аккаунтов пока нет.</div> : null}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-[#fff4d6]">Добавить провайдера</div>
            <InfoTip label="Какие данные нужны">
              Для Selectel укажите service user credentials. Для Timeweb Cloud укажите API token из раздела API и Terraform.
            </InfoTip>
          </div>
          <form action={createAccountAction} className="grid gap-3">
            <Field label="Провайдер">
              <Select name="provider" required defaultValue="selectel">
                <option value="selectel">Selectel</option>
                <option value="timeweb">Timeweb Cloud</option>
              </Select>
            </Field>
            <Field label="Название">
              <Input name="name" required placeholder="Основной аккаунт" />
            </Field>
            <Field label="ID аккаунта Selectel">
              <Input name="accountId" placeholder="Для Timeweb можно оставить пустым" />
            </Field>
            <Field label="Имя service user Selectel">
              <Input name="username" placeholder="Для Timeweb можно оставить пустым" />
            </Field>
            <Field label="Пароль Selectel или API token Timeweb">
              <Input name="password" type="password" required />
            </Field>
            <Button type="submit">Сохранить аккаунт</Button>
          </form>
        </Card>

        <Card>
          <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Подсказки</div>
          <div className="grid gap-3 text-sm text-[#cfc2a4]">
            <HelpItem
              title="Selectel"
              text="Создайте сервисного пользователя, выдайте роль vpc.admin на нужный проект, затем сохраните ID аккаунта, имя пользователя и пароль."
            />
            <HelpItem
              title="Timeweb Cloud"
              text="Создайте API token в панели Timeweb Cloud в разделе API и Terraform. После сохранения нажмите «Синхронизировать», чтобы получить проекты и зоны."
            />
            <HelpItem
              title="Профили"
              text="После синхронизации создайте профиль поиска. Панель использует общую модель: проект, зоны, список целевых IP/CIDR и лимитер."
            />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function HelpItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-black/20 p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#f6c453]">{title}</div>
      <div className="text-sm leading-5 text-[#cfc2a4]">{text}</div>
    </div>
  );
}
