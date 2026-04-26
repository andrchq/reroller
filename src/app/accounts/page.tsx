import { AccountForm } from "@/components/account-form";
import { AppShell, PageHeader } from "@/components/shell";
import { SyncProjectsButton } from "@/components/sync-projects-button";
import { Badge, Card, ListCard, PageNotice, SectionHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { providerLabel } from "@/lib/providers";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams?: Promise<{ noticeTone?: "good" | "bad" | "warn"; noticeTitle?: string; noticeMessage?: string; noticeDetails?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const accounts = await prisma.providerAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: { projects: { include: { regions: true } } },
  });

  return (
    <AppShell>
      <PageHeader title="Аккаунты" description="Учетные данные провайдеров и синхронизация проектов/зон." />
      {params?.noticeTitle ? (
        <PageNotice
          tone={params.noticeTone ?? "good"}
          title={params.noticeTitle}
          message={params.noticeMessage}
          details={params.noticeDetails}
        />
      ) : null}

      <div className="grid gap-4">
        <Card>
          <AccountForm />
        </Card>

        <Card>
          <SectionHeader title="Подсказки" description="Минимум данных для подключения и синхронизации провайдеров." />
          <div className="grid gap-3 text-sm text-[#cfc2a4] md:grid-cols-2 xl:grid-cols-4">
            <HelpItem
              title="Selectel"
              text="Создайте сервисного пользователя, выдайте роль vpc.admin на нужный проект, затем сохраните ID аккаунта, имя пользователя и пароль."
            />
            <HelpItem
              title="Timeweb Cloud"
              text="Создайте API token в панели Timeweb Cloud в разделе API и Terraform. После сохранения нажмите «Синхронизировать», чтобы получить проекты и зоны."
            />
            <HelpItem
              title="Reg.ru CloudVPS"
              text="Скопируйте API token в настройках облачного окружения Reg.ru. Синхронизация подготовит регионы, а профиль будет создавать временный минимальный сервер, проверять его IP и удалять сервер при промахе."
            />
            <HelpItem
              title="Профили"
              text="После синхронизации создайте профиль поиска. Панель использует общую модель: проект, зоны, список целевых IP/CIDR и лимитер."
            />
          </div>
        </Card>

        <Card>
          <SectionHeader title="Созданные аккаунты" description="Синхронизируйте проекты и зоны перед созданием профилей." />
          <div className="grid gap-3 xl:grid-cols-2">
            {accounts.map((account) => (
              <ListCard key={account.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-[#fff4d6]">{account.name}</div>
                      <Badge>{providerLabel(account.provider)}</Badge>
                    </div>
                    {account.provider === "selectel" ? (
                      <div className="mt-1 text-sm text-[var(--muted)]">
                        ID: {account.accountId} / user: {account.username}
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-[var(--muted)]">API token сохранен и зашифрован</div>
                    )}
                    <div className="mt-1 text-xs text-[var(--muted)]">Проектов: {account.projects.length}</div>
                  </div>
                  <SyncProjectsButton accountId={account.id} />
                </div>
                {account.projects.length > 0 ? (
                  <div className="mt-3 grid gap-1.5 text-xs leading-5 text-[var(--muted)]">
                    {account.projects.map((project) => (
                      <div key={project.id} className="min-w-0">
                        <span className="text-[#fff4d6]">{project.name}:</span>{" "}
                        <span className="break-words">
                          {project.regions.length > 0 ? project.regions.map((region) => region.name).join(", ") : "зон нет"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </ListCard>
            ))}
            {accounts.length === 0 ? <div className="text-sm text-[var(--muted)]">Аккаунтов пока нет.</div> : null}
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
