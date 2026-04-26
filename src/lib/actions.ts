"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { releaseProviderFloatingIp } from "@/lib/provider-floating-ip";
import { enqueueRun } from "@/lib/queue";
import { listRegRuCreateRegions, validateRegRuAccount } from "@/lib/regru";
import {
  cleanupSelectelOpenStackNetworkResources,
  defaultSelectelRegions,
  deleteSubnet,
  extractProjectRegions,
  getSelectelProjectDetails,
  listFloatingIps,
  listSelectelProjects,
  listSubnets,
  releaseFloatingIp,
} from "@/lib/selectel";
import { buildTelegramTestMessage, sendTelegramDirect } from "@/lib/telegram";
import { listTimewebProjects, listTimewebZones } from "@/lib/timeweb";
import { targetMatchesIp } from "@/lib/ip-matcher";
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
  const restMinMinutes = optionalNumber(formData, "restMinMinutes", 10);
  const restMaxMinutes = Math.max(restMinMinutes, optionalNumber(formData, "restMaxMinutes", 20));

  return {
    requestsPerMinute: optionalNumber(formData, "requestsPerMinute", 6),
    minDelaySeconds,
    maxDelaySeconds,
    errorDelaySeconds: optionalNumber(formData, "errorDelaySeconds", 60),
    maxRuntimeSeconds: optionalNumber(formData, "maxRuntimeSeconds", 3600),
    maxFindings: optionalNumber(formData, "maxFindings", 1),
    serverWaitIntervalSeconds: optionalNumber(formData, "serverWaitIntervalSeconds", 10),
    serverWaitMaxSeconds: optionalNumber(formData, "serverWaitMaxSeconds", 240),
    restMinMinutes,
    restMaxMinutes,
  };
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function selectedRegionsInput(formData: FormData) {
  return [...new Set(formData.getAll("regions").map((value) => String(value).trim()).filter(Boolean))];
}

function assertProjectRegions(project: { regions: { name: string }[] }, regions: string[]) {
  if (regions.length === 0) throw new Error("At least one zone is required");
  if (project.regions.length > 0) {
    const available = new Set(project.regions.map((item) => item.name));
    const missing = regions.filter((region) => !available.has(region));
    if (missing.length > 0) throw new Error(`Zones are not available for selected project: ${missing.join(", ")}`);
  }
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

function formatProviderSyncError(provider: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (provider === "selectel") return formatSelectelSyncError(error);

  if (provider === "timeweb") {
    if (message.includes("401") || message.includes("403")) {
      return "Timeweb не принял API token. Проверьте токен и права доступа в панели Timeweb Cloud.";
    }
    return message || "Неизвестная ошибка синхронизации Timeweb.";
  }

  if (provider === "regru") {
    if (message.includes("401") || message.includes("403") || message.toLowerCase().includes("token")) {
      return "Reg.ru не принял CloudVPS API token. Проверьте токен в настройках облачного окружения Reg.ru.";
    }
    return message || "Неизвестная ошибка синхронизации Reg.ru.";
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
  const provider = requiredString(formData, "provider");
  const secret = requiredString(formData, "password");
  const tokenOnlyProvider = provider === "timeweb" || provider === "regru";
  await prisma.providerAccount.create({
    data: {
      name: requiredString(formData, "name"),
      provider,
      accountId: tokenOnlyProvider ? provider : requiredString(formData, "accountId"),
      username: tokenOnlyProvider ? "api-token" : requiredString(formData, "username"),
      encryptedPassword: encryptSecret(secret),
    },
  });
  revalidatePath("/accounts");
  redirect("/accounts");
}

export async function updateAccountAction(formData: FormData) {
  await requireUser();
  const accountDbId = requiredString(formData, "accountDbId");
  const provider = requiredString(formData, "provider");
  const secret = String(formData.get("password") ?? "").trim();
  const tokenOnlyProvider = provider === "timeweb" || provider === "regru";
  const account = await prisma.providerAccount.findUnique({ where: { id: accountDbId } });
  if (!account) throw new Error("Account not found");

  await prisma.providerAccount.update({
    where: { id: accountDbId },
    data: {
      name: requiredString(formData, "name"),
      provider,
      accountId: tokenOnlyProvider ? provider : requiredString(formData, "accountId"),
      username: tokenOnlyProvider ? "api-token" : requiredString(formData, "username"),
      encryptedPassword: secret ? encryptSecret(secret) : account.encryptedPassword,
      encryptedIamToken: provider === account.provider ? account.encryptedIamToken : null,
      iamTokenExpiresAt: provider === account.provider ? account.iamTokenExpiresAt : null,
    },
  });
  revalidatePath("/accounts");
  revalidatePath("/profiles");
  revalidatePath("/tasks");
  redirect("/accounts");
}

async function releaseFindings(where: Prisma.FindingWhereInput) {
  const findings = await prisma.finding.findMany({
    where,
    include: {
      searchProfile: {
        include: {
          providerAccount: true,
          projectBinding: true,
        },
      },
    },
  });

  for (const finding of findings) {
    try {
      await releaseProviderFloatingIp({
        account: finding.searchProfile.providerAccount,
        projectId: finding.searchProfile.projectBinding.externalProjectId,
        projectName: finding.searchProfile.projectBinding.name,
        floatingIpId: finding.floatingIpId,
      });
    } catch {
      // Панель все равно удаляет запись. Провайдер мог уже удалить IP вручную.
    }
  }
}

export async function deleteAccountAction(formData: FormData) {
  await requireUser();
  const accountDbId = requiredString(formData, "accountDbId");
  const activeRuns = await prisma.run.count({
    where: {
      searchProfile: { providerAccountId: accountDbId },
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (activeRuns > 0) {
    await prisma.run.updateMany({
      where: {
        searchProfile: { providerAccountId: accountDbId },
        status: { in: ["QUEUED", "RUNNING"] },
      },
      data: { status: "STOPPED", failureReason: null, stoppedAt: new Date() },
    });
    redirect(
      `/accounts?noticeTone=warn&noticeTitle=${encodeURIComponent("Удаление отложено")}&noticeMessage=${encodeURIComponent("У аккаунта были активные задачи. Я остановил их безопасно. Нажмите удалить еще раз после остановки текущего шага.")}`,
    );
  }
  await releaseFindings({ searchProfile: { providerAccountId: accountDbId } });
  await prisma.providerAccount.delete({ where: { id: accountDbId } });
  revalidatePath("/accounts");
  revalidatePath("/profiles");
  revalidatePath("/tasks");
  revalidatePath("/findings");
  redirect("/accounts");
}

async function stopActiveProfileRuns(profileId: string) {
  const activeRuns = await prisma.run.count({
    where: {
      searchProfileId: profileId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (activeRuns === 0) return false;
  await prisma.run.updateMany({
    where: {
      searchProfileId: profileId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
    data: { status: "STOPPED", failureReason: null, stoppedAt: new Date() },
  });
  return true;
}

export async function syncProjectsAction(formData: FormData) {
  await requireUser();
  const accountId = requiredString(formData, "accountDbId");
  const account = await prisma.providerAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    return { ok: false, title: "Ошибка синхронизации", message: "Аккаунт не найден.", details: "" };
  }

  try {
    if (account.provider === "regru") {
      await validateRegRuAccount(account);
    }

    const projects =
      account.provider === "timeweb"
        ? (await listTimewebProjects(account)).map((project) => ({ id: String(project.id), name: project.name, url: undefined, regions: [] }))
        : account.provider === "regru"
          ? await listRegRuCreateRegions()
          : (await listSelectelProjects(account)).map((project) => ({ ...project, regions: [] }));

    if (account.provider === "regru" && projects.length === 0) {
      return {
        ok: false,
        title: "Reg.ru: регионы не найдены",
        message: "Не удалось подготовить регионы для создания временных серверов.",
        details: "Проверьте настройки провайдера Reg.ru.",
      };
    }

    const timewebZones = account.provider === "timeweb" ? await listTimewebZones(account) : [];
    let syncedProjects = 0;
    let syncedRegions = 0;
    const notes = new Set<string>();

    if (account.provider === "regru") {
      await prisma.projectBinding.deleteMany({
        where: {
          providerAccountId: account.id,
          externalProjectId: { in: ["openstack-msk1", "openstack-spb1", "openstack-msk2", "openstack-sam1"] },
          profiles: { none: {} },
        },
      });
      notes.add("Reg.ru использует один логический проект CloudVPS, а Москва, Санкт-Петербург, Москва-2 и Самара сохранены как зоны доступности.");
    }

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
      if (account.provider === "timeweb") {
        regions = timewebZones;
      } else if (account.provider === "regru") {
        regions = project.regions;
      } else {
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
      }

      if (regions.length === 0) {
        regions = account.provider === "timeweb" ? ["spb-1", "msk-1"] : account.provider === "regru" ? [] : defaultSelectelRegions;
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
      message: formatProviderSyncError(account.provider, error),
      details: "Проекты и регионы не обновлены.",
    };
  }
}

export async function createProfileAction(formData: FormData) {
  await requireUser();
  const projectBindingId = requiredString(formData, "projectBindingId");
  const regions = selectedRegionsInput(formData);
  const project = await prisma.projectBinding.findUnique({
    where: { id: projectBindingId },
    include: { regions: true },
  });
  if (!project) throw new Error("Project not found");
  assertProjectRegions(project, regions);

  const targets = splitLines(requiredString(formData, "targets"));
  if (targets.length === 0) throw new Error("At least one target IP is required");

  await prisma.searchProfile.create({
    data: {
      name: requiredString(formData, "name"),
      providerAccountId: project.providerAccountId,
      projectBindingId: project.id,
      region: regions[0],
      selectedRegions: { create: regions.map((name) => ({ name })) },
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
  const regions = selectedRegionsInput(formData);
  const project = await prisma.projectBinding.findUnique({
    where: { id: projectBindingId },
    include: { regions: true },
  });
  if (!project) throw new Error("Project not found");
  assertProjectRegions(project, regions);

  const targets = splitLines(requiredString(formData, "targets"));
  if (targets.length === 0) throw new Error("At least one target IP is required");

  await prisma.$transaction(async (tx) => {
    await tx.searchProfile.update({
      where: { id: profileId },
      data: {
        name: requiredString(formData, "name"),
        providerAccountId: project.providerAccountId,
        projectBindingId: project.id,
        region: regions[0],
      },
    });
    await tx.searchProfileRegion.deleteMany({ where: { searchProfileId: profileId } });
    await tx.searchProfileRegion.createMany({
      data: regions.map((name) => ({ searchProfileId: profileId, name })),
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

export async function duplicateProfileAction(formData: FormData) {
  await requireUser();
  const profileId = requiredString(formData, "profileId");
  const profile = await prisma.searchProfile.findUnique({
    where: { id: profileId },
    include: {
      selectedRegions: true,
      targets: true,
      rateLimit: true,
    },
  });
  if (!profile) throw new Error("Profile not found");

  const regions = profile.selectedRegions.length > 0 ? profile.selectedRegions.map((region) => region.name) : [profile.region];

  await prisma.searchProfile.create({
    data: {
      name: `${profile.name} копия`,
      providerAccountId: profile.providerAccountId,
      projectBindingId: profile.projectBindingId,
      region: regions[0],
      selectedRegions: { create: regions.map((name) => ({ name })) },
      targets: { create: profile.targets.map((target) => ({ value: target.value })) },
      rateLimit: profile.rateLimit
        ? {
            create: {
              requestsPerMinute: profile.rateLimit.requestsPerMinute,
              minDelaySeconds: profile.rateLimit.minDelaySeconds,
              maxDelaySeconds: profile.rateLimit.maxDelaySeconds,
              errorDelaySeconds: profile.rateLimit.errorDelaySeconds,
              maxRuntimeSeconds: profile.rateLimit.maxRuntimeSeconds,
              maxFindings: profile.rateLimit.maxFindings,
              serverWaitIntervalSeconds: profile.rateLimit.serverWaitIntervalSeconds,
              serverWaitMaxSeconds: profile.rateLimit.serverWaitMaxSeconds,
              restMinMinutes: profile.rateLimit.restMinMinutes,
              restMaxMinutes: profile.rateLimit.restMaxMinutes,
            },
          }
        : undefined,
    },
  });

  revalidatePath("/profiles");
  revalidatePath("/tasks");
  redirect("/profiles");
}

export async function deleteProfileAction(formData: FormData) {
  await requireUser();
  const profileId = requiredString(formData, "profileId");
  if (await stopActiveProfileRuns(profileId)) {
    redirect(`/profiles?cleanupError=${encodeURIComponent("У профиля были активные задачи. Я остановил их безопасно. Нажмите удалить еще раз после остановки текущего шага.")}`);
  }
  await releaseFindings({ searchProfileId: profileId });
  await prisma.searchProfile.delete({ where: { id: profileId } });
  revalidatePath("/profiles");
  revalidatePath("/tasks");
  revalidatePath("/findings");
  redirect("/profiles");
}

export async function cleanupSelectelProfileIpsAction(formData: FormData) {
  await requireUser();
  const profileId = requiredString(formData, "profileId");
  const profile = await prisma.searchProfile.findUnique({
    where: { id: profileId },
    include: {
      providerAccount: true,
      projectBinding: true,
      targets: true,
    },
  });

  if (!profile) redirect(`/profiles?cleanupError=${encodeURIComponent("Профиль не найден")}`);
  if (profile.providerAccount.provider !== "selectel") {
    redirect(`/profiles?cleanupError=${encodeURIComponent("Очистка доступна только для Selectel")}`);
  }

  const targets = profile.targets.map((target) => target.value);
  let floatingIps;
  try {
    floatingIps = await listFloatingIps({
      account: profile.providerAccount,
      projectId: profile.projectBinding.externalProjectId,
      projectName: profile.projectBinding.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось получить список Floating IP Selectel";
    redirect(`/profiles?cleanupError=${encodeURIComponent(message)}`);
  }

  let deleted = 0;
  let protectedCount = 0;
  let failed = 0;
  let subnetsDeleted = 0;
  let subnetsSkipped = 0;
  let routerPortsDeleted = 0;
  let routersDeleted = 0;
  let networksDeleted = 0;
  let networkSkipped = 0;

  for (const floatingIp of floatingIps) {
    const isProtected = targets.some((target) => targetMatchesIp(target, floatingIp.floating_ip_address));
    if (isProtected) {
      protectedCount += 1;
      continue;
    }

    try {
      await releaseFloatingIp({
        account: profile.providerAccount,
        projectName: profile.projectBinding.name,
        floatingIpId: floatingIp.id,
      });
      await prisma.finding.deleteMany({ where: { floatingIpId: floatingIp.id } });
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  const remainingProtectedIps = floatingIps.filter((floatingIp) =>
    targets.some((target) => targetMatchesIp(target, floatingIp.floating_ip_address)),
  );
  if (remainingProtectedIps.length === 0) {
    try {
      const subnets = await listSubnets({
        account: profile.providerAccount,
        projectId: profile.projectBinding.externalProjectId,
        projectName: profile.projectBinding.name,
      });
      const cleanupSubnets = subnets.filter((subnet) => subnet.servers.length === 0);
      const networkIds = [...new Set(cleanupSubnets.map((subnet) => subnet.network_id).filter(Boolean))];

      const openStackCleanup = await cleanupSelectelOpenStackNetworkResources({
        account: profile.providerAccount,
        projectId: profile.projectBinding.externalProjectId,
        projectName: profile.projectBinding.name,
        networkIds,
      }).catch(() => null);

      routerPortsDeleted = openStackCleanup?.routerPortsDeleted ?? 0;
      routersDeleted = openStackCleanup?.routersDeleted ?? 0;
      networksDeleted = openStackCleanup?.networksDeleted ?? 0;
      networkSkipped = openStackCleanup?.skipped ?? 0;

      for (const subnet of cleanupSubnets) {
        try {
          await deleteSubnet({
            account: profile.providerAccount,
            projectName: profile.projectBinding.name,
            subnetId: subnet.subnet_id,
          });
          subnetsDeleted += 1;
        } catch {
          subnetsSkipped += 1;
        }
      }

      subnetsSkipped += subnets.length - cleanupSubnets.length;
    } catch {
      networkSkipped += 1;
    }
  } else {
    networkSkipped += 1;
  }

  revalidatePath("/profiles");
  revalidatePath("/findings");
  revalidatePath("/tasks");
  const message = encodeURIComponent(
    `IP удалено: ${deleted}. IP защищено: ${protectedCount}. Ошибок IP: ${failed}. Подсетей удалено: ${subnetsDeleted}. Портов роутера удалено: ${routerPortsDeleted}. Роутеров удалено: ${routersDeleted}. Сетей удалено: ${networksDeleted}. Пропущено сетевых ресурсов: ${subnetsSkipped + networkSkipped}.`,
  );
  redirect(`/profiles?cleanup=${message}`);
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

export async function continueRunAction(formData: FormData) {
  await requireUser();
  const runId = requiredString(formData, "runId");
  const run = await prisma.run.findUnique({ where: { id: runId }, select: { searchProfileId: true } });
  if (!run) throw new Error("Run not found");
  const nextRun = await prisma.run.create({ data: { searchProfileId: run.searchProfileId, status: "QUEUED" } });
  await enqueueRun(nextRun.id);
  revalidatePath("/runs");
  revalidatePath("/tasks");
  redirect(`/tasks?run=${nextRun.id}`);
}

export async function continueFindingProfileAction(formData: FormData) {
  await requireUser();
  const findingId = requiredString(formData, "findingId");
  const finding = await prisma.finding.findUnique({ where: { id: findingId }, select: { searchProfileId: true } });
  if (!finding) throw new Error("Finding not found");
  const run = await prisma.run.create({ data: { searchProfileId: finding.searchProfileId, status: "QUEUED" } });
  await enqueueRun(run.id);
  revalidatePath("/findings");
  revalidatePath("/tasks");
  redirect(`/tasks?run=${run.id}`);
}

export async function deleteFindingAction(formData: FormData) {
  await requireUser();
  const findingId = requiredString(formData, "findingId");
  const finding = await prisma.finding.findUnique({
    where: { id: findingId },
    include: {
      searchProfile: {
        include: {
          providerAccount: true,
          projectBinding: true,
        },
      },
    },
  });
  if (!finding) throw new Error("Finding not found");

  await releaseProviderFloatingIp({
    account: finding.searchProfile.providerAccount,
    projectName: finding.searchProfile.projectBinding.name,
    floatingIpId: finding.floatingIpId,
  });
  await prisma.finding.delete({ where: { id: finding.id } });

  revalidatePath("/findings");
  revalidatePath("/tasks");
  redirect("/findings");
}

export async function deleteRunAction(formData: FormData) {
  await requireUser();
  const runId = requiredString(formData, "runId");
  const run = await prisma.run.findUnique({ where: { id: runId }, select: { status: true } });
  if (!run) redirect("/tasks");
  if (["QUEUED", "RUNNING"].includes(run.status)) {
    await prisma.run.update({
      where: { id: runId },
      data: { status: "STOPPED", failureReason: null, stoppedAt: new Date() },
    });
    redirect(`/tasks?deleteNotice=${encodeURIComponent("Запуск был активен. Я остановил его безопасно. Удалите его повторно после остановки текущего шага.")}`);
  }
  await releaseFindings({ runId });
  await prisma.run.delete({ where: { id: runId } });
  revalidatePath("/runs");
  revalidatePath("/tasks");
  revalidatePath("/findings");
  redirect("/tasks");
}

export async function stopRunAction(formData: FormData) {
  await requireUser();
  const runId = requiredString(formData, "runId");
  await prisma.run.update({
    where: { id: runId },
    data: { status: "STOPPED", failureReason: null, stoppedAt: new Date() },
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
    data: { status: "STOPPED", failureReason: null, stoppedAt: new Date() },
  });
  revalidatePath("/runs");
  revalidatePath("/tasks");
}

export async function deleteTelegramConfigAction() {
  await requireUser();
  await prisma.telegramConfig.deleteMany();
  revalidatePath("/settings");
  redirect("/settings?telegramDeleted=1");
}

export async function saveTelegramAction(formData: FormData) {
  await requireUser();
  const savedConfig = await prisma.telegramConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  const botToken = String(formData.get("botToken") ?? "").trim();
  const tokenToUse = botToken || (savedConfig ? decryptSecret(savedConfig.encryptedBotToken) : "");
  const chatId = requiredString(formData, "chatId");
  const messageThreadId = optionalString(formData, "messageThreadId");

  if (!tokenToUse) {
    redirect(`/settings?telegramError=${encodeURIComponent("Введите токен Telegram-бота.")}`);
  }

  try {
    await sendTelegramDirect({
      token: tokenToUse,
      chatId,
      messageThreadId,
      text: buildTelegramTestMessage(),
    });
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "Неизвестная ошибка Telegram");
    redirect(`/settings?telegramError=${message}`);
  }

  await prisma.telegramConfig.deleteMany();
  await prisma.telegramConfig.create({
    data: {
      encryptedBotToken: encryptSecret(tokenToUse),
      chatId,
      messageThreadId,
    },
  });
  revalidatePath("/settings");
  redirect("/settings?telegramSaved=1");
}
