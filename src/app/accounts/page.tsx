import { AppShell, PageHeader } from "@/components/shell";
import { Button, Card, Field, InfoTip, Input } from "@/components/ui";
import { createAccountAction, syncProjectsAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AccountsPage() {
  await requireUser();
  const accounts = await prisma.providerAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: { projects: true },
  });

  return (
    <AppShell>
      <PageHeader title="Аккаунты" description="Учетные данные Selectel и синхронизация проектов." />
      <div className="grid gap-4 xl:grid-cols-[1fr_24rem_22rem]">
        <Card>
          <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Список аккаунтов</div>
          <div className="grid gap-3">
            {accounts.map((account) => (
              <div key={account.id} className="rounded-md border border-[var(--line)] bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-[#fff4d6]">{account.name}</div>
                    <div className="text-sm text-[var(--muted)]">ID аккаунта: {account.accountId} / Пользователь: {account.username}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">Проектов: {account.projects.length}</div>
                  </div>
                  <form action={syncProjectsAction}>
                    <input type="hidden" name="accountDbId" value={account.id} />
                    <Button type="submit">Синхронизировать</Button>
                  </form>
                </div>
              </div>
            ))}
            {accounts.length === 0 ? <div className="text-sm text-[var(--muted)]">Аккаунтов пока нет.</div> : null}
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-[#fff4d6]">Добавить Selectel</div>
            <InfoTip label="Какой доступ нужен">
              Создайте сервисного пользователя в Selectel и выдайте ему роль <b>vpc.admin</b> в области доступа <b>Проект</b> на тот проект, где нужно подбирать публичные IP.
            </InfoTip>
          </div>
          <form action={createAccountAction} className="grid gap-3">
            <Field label="Название">
              <Input name="name" required placeholder="Основной Selectel" />
            </Field>
            <Field label="ID аккаунта">
              <Input name="accountId" required />
            </Field>
            <Field label="Имя сервисного пользователя">
              <Input name="username" required />
            </Field>
            <Field label="Пароль сервисного пользователя">
              <Input name="password" type="password" required />
            </Field>
            <Button type="submit">Сохранить аккаунт</Button>
          </form>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-[#fff4d6]">Подсказка по Selectel</div>
            <InfoTip label="Где создать пользователя">
              В панели Selectel откройте управление доступом, создайте сервисного пользователя, затем в настройках доступа добавьте разрешение на проект.
            </InfoTip>
          </div>
          <div className="grid gap-3 text-sm text-[#cfc2a4]">
            <HelpItem
              title="1. Создайте сервисного пользователя"
              text="В Selectel перейдите в управление доступом и создайте сервисного пользователя. В Reroller укажите его имя и пароль."
            />
            <HelpItem
              title="2. Выберите область доступа"
              text="В разрешении выберите область доступа «Проекты» и конкретный проект, где будут резервироваться IP."
            />
            <HelpItem
              title="3. Назначьте роль"
              text="Для работы с публичными IP нужна роль vpc.admin. Она дает создание и удаление публичных IP в выбранном проекте."
            />
            <HelpItem
              title="4. Синхронизируйте проекты"
              text="После сохранения аккаунта нажмите «Синхронизировать», затем создайте профиль поиска на странице «Профили»."
            />
            <a
              href="https://docs.selectel.ru/access-control/role-reference/"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-[#f6c453] hover:underline"
            >
              Открыть справочник ролей Selectel
            </a>
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
