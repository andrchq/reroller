import { AppShell, PageHeader } from "@/components/shell";
import { Button, Card, Field, Input, PageNotice, SectionHeader } from "@/components/ui";
import { deleteTelegramConfigAction, saveTelegramAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ telegramError?: string; telegramSaved?: string; telegramDeleted?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const config = await prisma.telegramConfig.findFirst({ orderBy: { updatedAt: "desc" } });

  return (
    <AppShell>
      <PageHeader title="Настройки" description="Telegram-бот, группа и топик для уведомлений о найденных IP." />
      {params.telegramSaved ? (
        <PageNotice title="Telegram сохранен" message="Настройки сохранены. Бот отправил пробное сообщение." />
      ) : null}
      {params.telegramError ? (
        <PageNotice tone="bad" title="Telegram не прошел проверку" message={params.telegramError} />
      ) : null}
      {params.telegramDeleted ? (
        <PageNotice tone="warn" title="Telegram удален" message="Настройки Telegram очищены." />
      ) : null}
      <div className="grid gap-4">
        <Card>
          <SectionHeader title="Telegram" description="Токен, группа и топик для уведомлений о найденных IP." />
          <form action={saveTelegramAction} className="grid gap-3 md:grid-cols-3 xl:grid-cols-[1.4fr_1fr_1fr_16rem] xl:items-end">
            <Field label="Токен бота">
              <Input name="botToken" type="password" required={!config} placeholder={config ? "Токен сохранен. Заполните только для замены" : "123456:ABC..."} />
            </Field>
            <Field label="ID чата или группы">
              <Input name="chatId" required defaultValue={config?.chatId ?? ""} placeholder="-1001234567890" />
            </Field>
            <Field label="ID топика">
              <Input name="messageThreadId" defaultValue={config?.messageThreadId ?? ""} placeholder="Оставьте пустым, если топик не нужен" />
            </Field>
            <Button type="submit">Проверить и сохранить Telegram</Button>
          </form>
          {config ? (
            <form action={deleteTelegramConfigAction} className="mt-3">
              <Button type="submit" className="bg-red-300 hover:bg-red-200">
                Удалить настройки Telegram
              </Button>
            </form>
          ) : null}
        </Card>
        <Card>
          <SectionHeader title="Что указывать" />
          <div className="grid gap-3 text-sm text-[#cfc2a4] md:grid-cols-2 xl:grid-cols-4">
            <p>Токен бота берется у BotFather.</p>
            <p>ID чата или группы обычно выглядит как отрицательное число, например `-1001234567890`.</p>
            <p>ID топика нужен только для Telegram-группы с включенными темами. Если оставить поле пустым, уведомления уйдут в общий чат группы.</p>
            <p>При сохранении бот отправляет тестовое сообщение. Если отправка не пройдет, настройки не сохранятся.</p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
