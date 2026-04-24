"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { enqueueRun } from "@/lib/queue";
import { defaultSelectelRegions, extractProjectRegions, getSelectelProjectDetails, listSelectelProjects } from "@/lib/selectel";
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

function rateLimitInput(formData: FormData) {
  const minDelaySeconds = optionalNumber(formData, "minDelaySeconds", 10);
  const maxDelaySeconds = Math.max(minDelaySeconds, optionalNumber(formData, "maxDelaySeconds", 30));

  return {
    requestsPerMinute: optionalNumber(formData, "requestsPerMinute", 6),
    minDelaySeconds,
    maxDelaySeconds,
    errorDelaySeconds: optionalNumber(formData, "errorDelaySeconds", 60),
    maxRuntimeSeconds: optionalNumber(formData, "maxRuntimeSeconds", 3600),
    maxFindings: optionalNumber(formData, "maxFindings", 1),
  };
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function formatSelectelSyncError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("policy_does_not_allow_this_request") || message.includes("403 Forbidden")) {
    return "Selectel отказал в доступе. Проверьте, что сервисному пользователю выдана роль vpc.admin в области доступа «Проекты» на нужный проект.";
  }

  if (message.includes("401") || message.toLowerCase().includes("auth")) {
    return "Не удалось авторизоваться в Selectel. Проверьте ID аккаунта, имя и пароль сервисного пользователя.";
  }

  return message || "Неизвестная ошибка синхронизации.";
}

export async function loginAction(formData: FormData) {
  const login = requiredString(formData, "login").toLowerCase();
  const password = requiredString(formData, "password");
  const user = await prisma.user.findUnique({ where: { login } });
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

  const login = requiredString(formData, "login").toLowerCase();
  const password = requiredString(formData, "password");
  const user = await prisma.user.create({
    data: { login, passwordHash: await hashPassword(password) },
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
  if (!account) {
    return { ok: false, title: "Ошибка синхронизации", message: "Аккаунт не найден.", details: "" };
  }

  try {
    const projects = await listSelectelProjects(account);
    let syncedProjects = 0;
    let syncedRegions = 0;
    const notes = new Set<string>();

    for (const project of projects) {
      const binding = await prisma.projectBinding.upsert({
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
      syncedProjects += 1;

      let regions: string[] = [];
      try {
        const details = await getSelectelProjectDetails(account, project.id);
        regions = extractProjectRegions(details);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("policy_does_not_allow_this_request") || message.includes("403 Forbidden")) {
          notes.add("Selectel не разрешил читать квоты проекта, поэтому использован стандартный список регионов.");
        } else {
          notes.add(`Не удалось прочитать квоты проекта «${project.name}», поэтому использован стандартный список регионов.`);
        }
      }

      if (regions.length === 0) {
        regions = defaultSelectelRegions;
      }

      await prisma.projectRegion.deleteMany({ where: { projectBindingId: binding.id } });
      await prisma.projectRegion.createMany({
        data: regions.map((name) => ({ projectBindingId: binding.id, name })),
        skipDuplicates: true,
      });
      syncedRegions += regions.length;
    }

    revalidatePath("/accounts");
    revalidatePath("/profiles");
    return {
      ok: true,
      title: "Синхронизация завершена",
      message: `Проектов: ${syncedProjects}. Регионов: ${syncedRegions}.`,
      details: [...notes].join(" "),
    };
  } catch (error) {
    return {
      ok: false,
      title: "Ошибка синхронизации",
      message: formatSelectelSyncError(error),
      details: "Проекты и регионы не обновлены.",
    };
  }
}

export async function createProfileAction(formData: FormData) {
  await requireUser();
  const projectBindingId = requiredString(formData, "projectBindingId");
  const region = requiredString(formData, "region");
  const project = await prisma.projectBinding.findUnique({
    where: { id: projectBindingId },
    include: { regions: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.regions.length > 0 && !project.regions.some((item) => item.name === region)) {
    throw new Error("Region is not available for selected project");
  }

  const targets = splitLines(requiredString(formData, "targets"));
  if (targets.length === 0) throw new Error("At least one target IP is required");

  await prisma.searchProfile.create({
    data: {
      name: requiredString(formData, "name"),
      providerAccountId: project.providerAccountId,
      projectBindingId: project.id,
      region,
      targets: { create: targets.map((value) => ({ value })) },
      rateLimit: {
        create: rateLimitInput(formData),
      },
    },
  });
  revalidatePath("/profiles");
  redirect("/profiles");
}

export async function updateProfileAction(formData: FormData) {
  await requireUser();
  const profileId = requiredString(formData, "profileId");
  const projectBindingId = requiredString(formData, "projectBindingId");
  const region = requiredString(formData, "region");
  const project = await prisma.projectBinding.findUnique({
    where: { id: projectBindingId },
    include: { regions: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.regions.length > 0 && !project.regions.some((item) => item.name === region)) {
    throw new Error("Region is not available for selected project");
  }

  const targets = splitLines(requiredString(formData, "targets"));
  if (targets.length === 0) throw new Error("At least one target IP is required");

  await prisma.$transaction(async (tx) => {
    await tx.searchProfile.update({
      where: { id: profileId },
      data: {
        name: requiredString(formData, "name"),
        providerAccountId: project.providerAccountId,
        projectBindingId: project.id,
        region,
      },
    });
    await tx.targetIp.deleteMany({ where: { searchProfileId: profileId } });
    await tx.targetIp.createMany({
      data: targets.map((value) => ({ searchProfileId: profileId, value })),
    });
    await tx.rateLimitPolicy.upsert({
      where: { searchProfileId: profileId },
      create: {
        searchProfileId: profileId,
        ...rateLimitInput(formData),
      },
      update: rateLimitInput(formData),
    });
  });

  revalidatePath("/profiles");
  revalidatePath("/tasks");
  redirect("/profiles");
}

export async function startProfileAction(formData: FormData) {
  await requireUser();
  const profileId = requiredString(formData, "profileId");
  const run = await prisma.run.create({ data: { searchProfileId: profileId, status: "QUEUED" } });
  await enqueueRun(run.id);
  revalidatePath("/runs");
  revalidatePath("/tasks");
  redirect(`/tasks?run=${run.id}`);
}

export async function stopRunAction(formData: FormData) {
  await requireUser();
  const runId = requiredString(formData, "runId");
  await prisma.run.update({
    where: { id: runId },
    data: { status: "STOPPED", stoppedAt: new Date() },
  });
  revalidatePath("/runs");
  revalidatePath("/tasks");
}

export async function stopProfileRunsAction(formData: FormData) {
  await requireUser();
  const profileId = requiredString(formData, "profileId");
  await prisma.run.updateMany({
    where: {
      searchProfileId: profileId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
    data: { status: "STOPPED", stoppedAt: new Date() },
  });
  revalidatePath("/runs");
  revalidatePath("/tasks");
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
