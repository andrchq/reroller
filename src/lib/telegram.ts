import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

type TelegramSendInput = {
  token: string;
  chatId: string;
  messageThreadId?: string | null;
  text: string;
};

const separator = "➖➖➖➖➖➖➖➖➖";

const premiumEmoji = {
  alien: '<tg-emoji emoji-id="5370869711888194012">👾</tg-emoji>',
  demon: '<tg-emoji emoji-id="5372951839018850336">👹</tg-emoji>',
  eyes: '<tg-emoji emoji-id="5424885441100782420">👀</tg-emoji>',
  calendar: '<tg-emoji emoji-id="5431897022456145283">📆</tg-emoji>',
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatTelegramTime(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

export function buildFindingMessage(input: {
  profileName: string;
  accountName: string;
  projectName: string;
  region: string;
  floatingIpAddress: string;
  floatingIpId: string;
}) {
  return [
    `<b>${premiumEmoji.alien} Reroller: найден подходящий IP</b>`,
    "",
    `◽️ <b>Профиль:</b> ${escapeHtml(input.profileName)}`,
    `◽️ <b>Аккаунт:</b> ${escapeHtml(input.accountName)}`,
    `◽️ <b>Проект:</b> ${escapeHtml(input.projectName)}`,
    `◽️ <b>Регион:</b> ${escapeHtml(input.region)}`,
    separator,
    `◽️ <b>IP:</b> <code>${escapeHtml(input.floatingIpAddress)}</code>`,
    `◽️ <b>ID Floating IP:</b> <code>${escapeHtml(input.floatingIpId)}</code>`,
    separator,
    `◽️ <b>${premiumEmoji.calendar} Время:</b> ${formatTelegramTime()}`,
  ].join("\n");
}

export function buildTelegramTestMessage() {
  return [
    `<b>${premiumEmoji.eyes} Reroller: проверка Telegram</b>`,
    "",
    "◽️ <b>Статус:</b> бот подключен",
    separator,
    "◽️ <b>Чат:</b> сообщение доставлено",
    "◽️ <b>Топик:</b> проверен, если был указан",
    separator,
    `◽️ <b>${premiumEmoji.calendar} Время:</b> ${formatTelegramTime()}`,
  ].join("\n");
}

function telegramPayload(input: TelegramSendInput) {
  const payload: Record<string, string | number | boolean> = {
    chat_id: input.chatId,
    text: input.text,
    parse_mode: "HTML",
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
