import type { ProviderAccount } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import { wait } from "@/lib/utils";

const apiUrl = "https://api.cloudvps.reg.ru";
const serverNamePrefixes = ["web", "app", "api", "db", "dev", "test", "stage", "prod", "backup", "monitor"];
const serverNameRoles = ["node", "server", "host", "vm", "main", "worker", "service"];

type RegRuErrorDetails = {
  status: number;
  statusText: string;
  code?: string;
  message?: string;
  raw: string;
};

type RegRuReglet = {
  id: number;
  archived_at?: string | null;
  created_at?: string | null;
  name?: string;
  hostname?: string;
  ip?: string;
  region_slug?: string;
  status?: string;
};

type RegRuPlan = {
  slug?: string;
  name?: string;
  price?: string | number;
  price_month?: string | number;
  price_per_hour?: string | number;
  price_per_month?: string | number;
  disk?: number;
  memory?: number;
  vcpus?: number;
};

type RegRuImage = {
  id?: number;
  slug?: string;
  name?: string;
  distribution?: string;
  type?: string;
  region_slug?: string;
};

export type RegRuServerProject = {
  id: string;
  name: string;
  url?: string;
  regions: string[];
};

export type RegRuFloatingIp = {
  id: string;
  floating_ip_address: string;
  project_id: string;
  region: string;
  status: string;
};

export const regRuCreateRegions = ["openstack-msk1", "openstack-spb1", "openstack-msk2", "openstack-sam1"];

export const regRuProject = {
  id: "cloudvps",
  name: "Reg.ru CloudVPS",
  url: undefined,
  regions: regRuCreateRegions,
} satisfies RegRuServerProject;

export class RegRuApiError extends Error {
  status: number;
  code?: string;
  raw: string;
  fatal: boolean;

  constructor(operation: string, details: RegRuErrorDetails) {
    const normalized = `${details.code ?? ""} ${details.message ?? ""} ${details.raw}`.toLowerCase();
    const isAuth = details.status === 401 || details.status === 403;
    const isBalance = normalized.includes("balance") || normalized.includes("money") || normalized.includes("payment") || normalized.includes("fund");
    const isLimit = normalized.includes("limit") || normalized.includes("quota") || normalized.includes("too many");
    const isImageNotFound = normalized.includes("image_not_found") || normalized.includes("image not found");
    const message = isAuth
      ? "Reg.ru: API token не принят. Проверьте токен CloudVPS API в панели Рег.облака и запустите профиль снова."
      : isBalance
        ? "Reg.ru: недостаточно баланса для создания временного сервера. Пополните баланс и запустите профиль снова."
        : isLimit
          ? "Reg.ru: достигнут лимит серверов или сетевых ресурсов на аккаунте. Освободите ресурсы или увеличьте лимит."
          : isImageNotFound
            ? "Reg.ru: выбранный образ ОС не найден в зоне создания сервера. Синхронизируйте аккаунт и запустите профиль снова."
          : `Reg.ru ${operation} failed: ${formatRegRuError(details)}`;

    super(message);
    this.name = "RegRuApiError";
    this.status = details.status;
    this.code = details.code;
    this.raw = details.raw;
    this.fatal = isAuth || isBalance || isLimit || isImageNotFound;
  }
}

function formatRegRuError(details: RegRuErrorDetails) {
  const code = details.code ? `${details.code}: ` : "";
  return `${details.status} ${details.statusText}: ${code}${details.message ?? details.raw}`;
}

async function readRegRuError(response: Response): Promise<RegRuErrorDetails> {
  const text = await response.text();
  if (!text) return { status: response.status, statusText: response.statusText, raw: "" };

  try {
    const payload = JSON.parse(text) as {
      error?: string;
      error_code?: string | number;
      code?: string | number;
      message?: string | string[];
      detail?: string;
      errors?: unknown;
    };
    const message = Array.isArray(payload.message)
      ? payload.message.join("; ")
      : payload.message ?? payload.detail ?? payload.error ?? (payload.errors ? JSON.stringify(payload.errors) : undefined);
    return {
      status: response.status,
      statusText: response.statusText,
      code: payload.error_code || payload.code ? String(payload.error_code ?? payload.code) : undefined,
      message,
      raw: text,
    };
  } catch {
    return { status: response.status, statusText: response.statusText, message: text, raw: text };
  }
}

async function createRegRuApiError(operation: string, response: Response) {
  return new RegRuApiError(operation, await readRegRuError(response));
}

async function regRuFetch(account: ProviderAccount, path: string, init: RequestInit = {}) {
  const token = decryptSecret(account.encryptedPassword);
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

function numericPrice(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function randomServerName() {
  const prefix = serverNamePrefixes[Math.floor(Math.random() * serverNamePrefixes.length)];
  const role = serverNameRoles[Math.floor(Math.random() * serverNameRoles.length)];
  const suffix = String(Math.floor(Math.random() * 90) + 10);
  return `${prefix}-${role}-${suffix}`;
}

export function normalizeRegRuServer(reglet: RegRuReglet): RegRuServerProject | null {
  if (!reglet.id || !reglet.region_slug) return null;
  if (reglet.archived_at || reglet.status === "archive") return null;
  const title = reglet.name || reglet.hostname || `Сервер ${reglet.id}`;
  const ipSuffix = reglet.ip ? ` / ${reglet.ip}` : "";
  return {
    id: String(reglet.id),
    name: `${title}${ipSuffix}`,
    regions: [reglet.region_slug],
  };
}

export function normalizeRegRuRegletIp(reglet: RegRuReglet): RegRuFloatingIp | null {
  if (!reglet.id || !reglet.ip) return null;
  return {
    id: String(reglet.id),
    floating_ip_address: reglet.ip,
    project_id: String(reglet.id),
    region: reglet.region_slug ?? "",
    status: reglet.status ?? "new",
  };
}

export async function listRegRuCreateRegions() {
  return [regRuProject];
}

export async function validateRegRuAccount(account: ProviderAccount) {
  await listRegRuPlans(account, "openstack-msk1");
}

async function listRegRuPlans(account: ProviderAccount, region: string) {
  const response = await regRuFetch(account, `/v2/plans?region=${encodeURIComponent(region)}&page=1&items_per_page=100&unit=hour`);
  if (!response.ok) throw await createRegRuApiError("plans list", response);
  const payload = (await response.json()) as { plans?: RegRuPlan[] };
  return payload.plans ?? [];
}

async function listRegRuImages(account: ProviderAccount, region: string) {
  const response = await regRuFetch(
    account,
    `/v2/images?type=distribution&region=${encodeURIComponent(region)}&page=1&items_per_page=100`,
  );
  if (!response.ok) throw await createRegRuApiError("images list", response);
  const payload = (await response.json()) as { images?: RegRuImage[] };
  return payload.images ?? [];
}

function selectSmallestPlan(plans: RegRuPlan[]) {
  const available = plans.filter((plan) => plan.slug);
  available.sort((a, b) => {
    const byPrice = numericPrice(a.price_per_hour ?? a.price) - numericPrice(b.price_per_hour ?? b.price);
    if (byPrice !== 0) return byPrice;
    const byCpu = (a.vcpus ?? 999) - (b.vcpus ?? 999);
    if (byCpu !== 0) return byCpu;
    const byRam = (a.memory ?? 999999) - (b.memory ?? 999999);
    if (byRam !== 0) return byRam;
    return (a.disk ?? 999999) - (b.disk ?? 999999);
  });
  return available.find((plan) => plan.slug?.includes("hp-c1-m1-d10")) ?? available[0] ?? null;
}

function selectUbuntuImage(images: RegRuImage[], region: string) {
  const available = images.filter((image) => (image.slug || image.id) && (!image.region_slug || image.region_slug === region));
  return (
    available.find((image) => image.slug?.includes("ubuntu-24-04") || image.name?.toLowerCase().includes("ubuntu 24.04")) ??
    available.find((image) => image.slug?.includes("ubuntu-22-04") || image.name?.toLowerCase().includes("ubuntu 22.04")) ??
    available.find((image) => image.slug?.includes("ubuntu") || image.name?.toLowerCase().includes("ubuntu")) ??
    available[0] ??
    null
  );
}

async function getRegRuServer(account: ProviderAccount, serverId: string) {
  const response = await regRuFetch(account, `/v1/reglets/${encodeURIComponent(serverId)}`);
  if (!response.ok) throw await createRegRuApiError("server details", response);
  const payload = (await response.json()) as { reglet?: RegRuReglet };
  return payload.reglet ?? null;
}

async function listRegRuServers(account: ProviderAccount) {
  const response = await regRuFetch(account, "/v1/reglets");
  if (!response.ok) throw await createRegRuApiError("servers list", response);
  const payload = (await response.json()) as { reglets?: RegRuReglet[] };
  return payload.reglets ?? [];
}

async function findRegRuServerByName(account: ProviderAccount, name: string) {
  const servers = await listRegRuServers(account);
  return servers.find((server) => !server.archived_at && server.status !== "archive" && server.name === name) ?? null;
}

async function deleteRegRuServer(account: ProviderAccount, serverId: string) {
  const response = await regRuFetch(account, `/v1/reglets/${encodeURIComponent(serverId)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw await createRegRuApiError("server delete", response);
}

function isImageNotFoundError(error: unknown) {
  if (!(error instanceof RegRuApiError)) return false;
  const normalized = `${error.code ?? ""} ${error.message} ${error.raw}`.toLowerCase();
  return normalized.includes("image_not_found") || normalized.includes("image not found");
}

async function createRegRuServer(input: {
  account: ProviderAccount;
  body: Record<string, string | number | boolean>;
}) {
  const response = await regRuFetch(input.account, "/v1/reglets", {
    method: "POST",
    body: JSON.stringify(input.body),
  });

  if (!response.ok) throw await createRegRuApiError("server create", response);
  const payload = (await response.json()) as { reglet?: RegRuReglet };
  const created = payload.reglet;
  if (!created?.id) throw new Error(`Reg.ru server create returned an unexpected payload: ${JSON.stringify(payload).slice(0, 700)}`);
  return created;
}

function uniqueCreateBodies(input: {
  name: string;
  region: string;
  planSlug: string;
  imageSlug?: string;
  imageId?: number;
}) {
  const imageValues = [input.imageSlug, input.imageId].filter((value): value is string | number => value !== undefined);
  const bodies: Array<{ label: string; body: Record<string, string | number | boolean> }> = [];

  for (const image of imageValues) {
    bodies.push({
      label: `region_slug + image ${image}`,
      body: {
        name: input.name,
        size: input.planSlug,
        image,
        region_slug: input.region,
      },
    });
  }

  for (const image of imageValues) {
    bodies.push({
      label: `image ${image}`,
      body: {
        name: input.name,
        size: input.planSlug,
        image,
      },
    });
  }

  const seen = new Set<string>();
  return bodies.filter((candidate) => {
    const key = JSON.stringify(candidate.body);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function createRegRuServerWithFallbacks(input: {
  account: ProviderAccount;
  name: string;
  region: string;
  planSlug: string;
  image: RegRuImage;
  onLog?: (message: string) => Promise<void>;
}) {
  const candidates = uniqueCreateBodies({
    name: input.name,
    region: input.region,
    planSlug: input.planSlug,
    imageSlug: input.image.slug,
    imageId: input.image.id,
  });
  let lastError: unknown = null;

  for (const [index, candidate] of candidates.entries()) {
    if (index > 0) {
      await input.onLog?.(`Reg.ru: повторяю создание временного сервера, вариант: ${candidate.label}.`);
    }

    try {
      return await createRegRuServer({
        account: input.account,
        body: candidate.body,
      });
    } catch (error) {
      lastError = error;

      await wait(2_000);
      const existing = await findRegRuServerByName(input.account, input.name).catch(() => null);
      if (existing?.id) {
        await input.onLog?.(`Reg.ru: API вернул ошибку, но сервер ${existing.id} уже создан. Продолжаю проверку IP.`);
        return existing;
      }

      if (!isImageNotFoundError(error) && !(error instanceof RegRuApiError && error.status >= 500)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Reg.ru: сервер не создан, все варианты запроса отклонены.");
}

export async function allocateRegRuFloatingIp(input: {
  account: ProviderAccount;
  regletId: string;
  region: string;
  waitIntervalSeconds: number;
  waitMaxSeconds: number;
  onLog?: (message: string) => Promise<void>;
  shouldContinue?: () => Promise<boolean>;
}) {
  const plans = await listRegRuPlans(input.account, input.region);
  const plan = selectSmallestPlan(plans);
  if (!plan?.slug) throw new Error(`Reg.ru: в регионе ${input.region} не найден доступный почасовой тариф для временного сервера.`);

  const images = await listRegRuImages(input.account, input.region);
  const image = selectUbuntuImage(images, input.region);
  if (!image?.slug && !image?.id) throw new Error(`Reg.ru: в регионе ${input.region} не найден образ Ubuntu для временного сервера.`);

  const name = randomServerName();
  await input.onLog?.(
    `Reg.ru: создаю временный сервер "${name}" в ${input.region}. Тариф: ${plan.slug}. Образ: ${image.slug ?? image.id}.`,
  );
  const created = await createRegRuServerWithFallbacks({
    account: input.account,
    name,
    region: input.region,
    planSlug: plan.slug,
    image,
    onLog: input.onLog,
  });

  const initialIp = normalizeRegRuRegletIp(created);
  if (initialIp?.floating_ip_address) return initialIp;

  const waitIntervalSeconds = Math.max(5, input.waitIntervalSeconds);
  await input.onLog?.(`Reg.ru: сервер ${created.id} создан, ожидаю выдачу IP без ограничения по времени. Проверка каждые ${waitIntervalSeconds} сек.`);

  for (let attempt = 1; ; attempt += 1) {
    await wait(waitIntervalSeconds * 1000);
    if (input.shouldContinue && !(await input.shouldContinue())) {
      await deleteRegRuServer(input.account, String(created.id));
      throw new Error(`Reg.ru: ожидание IP для сервера ${created.id} остановлено оператором. Сервер удален автоматически.`);
    }
    await input.onLog?.(`Reg.ru: проверка готовности сервера ${created.id}, попытка ${attempt}`);
    const current = await getRegRuServer(input.account, String(created.id));
    const floatingIp = current ? normalizeRegRuRegletIp(current) : null;
    if (floatingIp?.floating_ip_address) return floatingIp;
  }
}

export async function releaseRegRuFloatingIp(input: {
  account: ProviderAccount;
  floatingIpId: string;
}) {
  await deleteRegRuServer(input.account, input.floatingIpId);
}
