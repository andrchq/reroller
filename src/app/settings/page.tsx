import { AppShell, PageHeader } from "@/components/shell";
import { Button, Card, Field, Input } from "@/components/ui";
import { saveTelegramAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ telegramError?: string; telegramSaved?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const config = await prisma.telegramConfig.findFirst({ orderBy: { updatedAt: "desc" } });

  return (
    <AppShell>
      <PageHeader title="Настройки" description="Telegram-бот, группа и топик для уведомлений о найденных IP." />
      <div className="grid gap-4 xl:grid-cols-[32rem_1fr]">
        <Card>
          <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Telegram</div>
          {params.telegramSaved ? (
            <div className="mb-3 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
              Настройки сохранены. Бот отправил пробное сообщение.
            </div>
          ) : null}
          {params.telegramError ? (
            <div className="mb-3 rounded-md border border-red-400/20 bg-red-400/10 p-3 text-sm leading-5 text-red-100">
              Telegram не прошел проверку: {params.telegramError}
            </div>
          ) : null}
          <form action={saveTelegramAction} className="grid gap-3">
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
        </Card>
        <Card>
          <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Что указывать</div>
          <div className="grid gap-3 text-sm text-[#cfc2a4]">
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
