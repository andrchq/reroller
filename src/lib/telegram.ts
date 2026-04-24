import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

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

export async function sendTelegramMessage(text: string) {
  const config = await prisma.telegramConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!config) return false;

  const token = decryptSecret(config.encryptedBotToken);
  const payload: Record<string, string | number | boolean> = {
    chat_id: config.chatId,
    text,
    disable_web_page_preview: true,
  };

  if (config.messageThreadId) {
    const threadId = Number(config.messageThreadId);
    payload.message_thread_id = Number.isFinite(threadId) ? threadId : config.messageThreadId;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return response.ok;
}
