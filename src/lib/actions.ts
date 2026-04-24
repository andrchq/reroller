"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { enqueueRun } from "@/lib/queue";
import { listSelectelProjects } from "@/lib/selectel";
import { splitLines } from "@/lib/utils";

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function optionalNumber(formData: FormData, key: string, fallback: number) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function loginAction(formData: FormData) {
  const email = requiredString(formData, "email").toLowerCase();
  const password = requiredString(formData, "password");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/login?error=1");
  }
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function createInitialAdminAction(formData: FormData) {
  const users = await prisma.user.count();
  if (users > 0) redirect("/login");

  const email = requiredString(formData, "email").toLowerCase();
  const password = requiredString(formData, "password");
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password) },
  });
  await createSession(user.id);
  redirect("/");
}

export async function createAccountAction(formData: FormData) {
  await requireUser();
  await prisma.providerAccount.create({
    data: {
      name: requiredString(formData, "name"),
      accountId: requiredString(formData, "accountId"),
      username: requiredString(formData, "username"),
      encryptedPassword: encryptSecret(requiredString(formData, "password")),
    },
  });
  revalidatePath("/accounts");
  redirect("/accounts");
}

export async function syncProjectsAction(formData: FormData) {
  await requireUser();
  const accountId = requiredString(formData, "accountDbId");
  const account = await prisma.providerAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Account not found");
  const projects = await listSelectelProjects(account);

  for (const project of projects) {
    await prisma.projectBinding.upsert({
      where: {
        providerAccountId_externalProjectId: {
          providerAccountId: account.id,
          externalProjectId: project.id,
        },
      },
      create: {
        providerAccountId: account.id,
        externalProjectId: project.id,
        name: project.name,
        url: project.url,
      },
      update: {
        name: project.name,
        url: project.url,
      },
    });
  }
  revalidatePath("/accounts");
  revalidatePath("/profiles");
}

export async function createProfileAction(formData: FormData) {
  await requireUser();
  const projectBindingId = requiredString(formData, "projectBindingId");
  const project = await prisma.projectBinding.findUnique({ where: { id: projectBindingId } });
  if (!project) throw new Error("Project not found");

  const targets = splitLines(requiredString(formData, "targets"));
  if (targets.length === 0) throw new Error("At least one target IP is required");

  await prisma.searchProfile.create({
    data: {
      name: requiredString(formData, "name"),
      providerAccountId: project.providerAccountId,
      projectBindingId: project.id,
      region: requiredString(formData, "region"),
      targets: { create: targets.map((value) => ({ value })) },
      rateLimit: {
        create: {
          requestsPerMinute: optionalNumber(formData, "requestsPerMinute", 6),
          minDelayMs: optionalNumber(formData, "minDelayMs", 10_000),
          burst: optionalNumber(formData, "burst", 1),
          cooldownAfterError: optionalNumber(formData, "cooldownAfterError", 60_000),
          maxAttempts: optionalNumber(formData, "maxAttempts", 100),
        },
      },
    },
  });
  revalidatePath("/profiles");
  redirect("/profiles");
}

export async function startProfileAction(formData: FormData) {
  await requireUser();
  const profileId = requiredString(formData, "profileId");
  const run = await prisma.run.create({ data: { searchProfileId: profileId, status: "QUEUED" } });
  await enqueueRun(run.id);
  revalidatePath("/runs");
  redirect(`/runs?run=${run.id}`);
}

export async function stopRunAction(formData: FormData) {
  await requireUser();
  const runId = requiredString(formData, "runId");
  await prisma.run.update({
    where: { id: runId },
    data: { status: "STOPPED", stoppedAt: new Date() },
  });
  revalidatePath("/runs");
}

export async function saveTelegramAction(formData: FormData) {
  await requireUser();
  await prisma.telegramConfig.deleteMany();
  await prisma.telegramConfig.create({
    data: {
      encryptedBotToken: encryptSecret(requiredString(formData, "botToken")),
      chatId: requiredString(formData, "chatId"),
      messageThreadId: optionalString(formData, "messageThreadId"),
    },
  });
  revalidatePath("/settings");
  redirect("/settings");
}
