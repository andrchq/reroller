import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

type TelegramSendInput = {
  token: string;
  chatId: string;
  messageThreadId?: string | null;
  text: string;
};

export function buildFindingMessage(input: {
  profileName: string;
  accountName: string;
  projectName: string;
  region: string;
  floatingIpAddress: string;
  floatingIpId: string;
}) {
  return [
    "Reroller: найден подходящий IP",
    `Профиль: ${input.profileName}`,
    `Аккаунт: ${input.accountName}`,
    `Проект: ${input.projectName}`,
    `Регион: ${input.region}`,
    `IP: ${input.floatingIpAddress}`,
    `ID Floating IP: ${input.floatingIpId}`,
    `Время: ${new Date().toISOString()}`,
  ].join("\n");
}

export function buildTelegramTestMessage() {
  return [
    "Reroller: проверка Telegram",
    "Если вы видите это сообщение, бот, чат и топик настроены корректно.",
    `Время: ${new Date().toISOString()}`,
  ].join("\n");
}

function telegramPayload(input: TelegramSendInput) {
  const payload: Record<string, string | number | boolean> = {
    chat_id: input.chatId,
    text: input.text,
    disable_web_page_preview: true,
  };

  if (input.messageThreadId) {
    const threadId = Number(input.messageThreadId);
    payload.message_thread_id = Number.isFinite(threadId) ? threadId : input.messageThreadId;
  }

  return payload;
}

async function readTelegramError(response: Response) {
  const text = await response.text();
  if (!text) return `${response.status} ${response.statusText}`;

  try {
    const payload = JSON.parse(text) as { description?: string };
    return payload.description || text;
  } catch {
    return text;
  }
}

export async function sendTelegramDirect(input: TelegramSendInput) {
  const response = await fetch(`https://api.telegram.org/bot${input.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(telegramPayload(input)),
  });

  if (!response.ok) {
    throw new Error(await readTelegramError(response));
  }
}

export async function sendTelegramMessage(text: string) {
  const config = await prisma.telegramConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!config) return false;

  try {
    await sendTelegramDirect({
      token: decryptSecret(config.encryptedBotToken),
      chatId: config.chatId,
      messageThreadId: config.messageThreadId,
      text,
    });
    return true;
  } catch {
    return false;
  }
}
