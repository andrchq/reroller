import { AppShell, PageHeader } from "@/components/shell";
import { Button, Card, Field, Input } from "@/components/ui";
import { saveTelegramAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage() {
  await requireUser();
  const config = await prisma.telegramConfig.findFirst({ orderBy: { updatedAt: "desc" } });

  return (
    <AppShell>
      <PageHeader title="Настройки" description="Telegram-бот, группа и топик для уведомлений о найденных IP." />
      <div className="grid gap-4 xl:grid-cols-[32rem_1fr]">
        <Card>
          <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Telegram</div>
          <form action={saveTelegramAction} className="grid gap-3">
            <Field label="Токен бота">
              <Input name="botToken" type="password" required placeholder={config ? "Введите новый токен для замены" : "123456:ABC..."} />
            </Field>
            <Field label="ID чата или группы">
              <Input name="chatId" required defaultValue={config?.chatId ?? ""} placeholder="-1001234567890" />
            </Field>
            <Field label="ID топика">
              <Input name="messageThreadId" defaultValue={config?.messageThreadId ?? ""} placeholder="Оставьте пустым, если топик не нужен" />
            </Field>
            <Button type="submit">Сохранить Telegram</Button>
          </form>
        </Card>
        <Card>
          <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Что указывать</div>
          <div className="grid gap-3 text-sm text-[#cfc2a4]">
            <p>Токен бота берется у BotFather.</p>
            <p>ID чата или группы обычно выглядит как отрицательное число, например `-1001234567890`.</p>
            <p>ID топика нужен только для Telegram-групп с включенными темами. Если оставить поле пустым, уведомления уйдут в общий чат группы.</p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
