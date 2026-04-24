import { AppShell, PageHeader } from "@/components/shell";
import { Button, Card, Field, Input } from "@/components/ui";
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
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
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
          <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Добавить Selectel</div>
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
      </div>
    </AppShell>
  );
}
