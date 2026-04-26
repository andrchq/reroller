"use client";

import { useMemo, useState } from "react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { createProfileAction, updateProfileAction } from "@/lib/actions";
import { selectelZoneGroups } from "@/lib/selectel-zones";

type ProjectOption = {
  id: string;
  label: string;
  regions: string[];
  provider: string;
};

type ProfileDefaults = {
  id: string;
  name: string;
  projectBindingId: string;
  region: string;
  regions: string[];
  targets: string;
  requestsPerMinute: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  errorDelaySeconds: number;
  maxRuntimeSeconds: number;
  maxFindings: number;
  serverWaitIntervalSeconds: number;
  serverWaitMaxSeconds: number;
  restMinMinutes: number;
  restMaxMinutes: number;
};

export function ProfileForm({
  projects,
  profile,
  framed = true,
}: {
  projects: ProjectOption[];
  profile?: ProfileDefaults;
  framed?: boolean;
}) {
  const [projectId, setProjectId] = useState(profile?.projectBindingId ?? projects[0]?.id ?? "");
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projectId, projects],
  );
  const regions = selectedProject?.regions ?? [];
  const isRegRu = selectedProject?.provider === "regru";
  const [selectedRegions, setSelectedRegions] = useState(
    profile?.regions.length ? profile.regions : profile?.region ? [profile.region] : regions[0] ? [regions[0]] : [],
  );
  const regionGroups: Record<string, Array<{ name: string; city: string; label: string; badge?: string }>> =
    selectedProject?.provider === "selectel"
      ? selectelZoneGroups(regions)
      : selectedProject?.provider === "regru"
        ? regRuZoneGroups(regions)
      : { "Зоны провайдера": regions.map((name) => ({ name, city: "Зоны провайдера", label: "Зона доступности" })) };
  const action = profile ? updateProfileAction : createProfileAction;
  const content = (
    <>
      <div className="mb-3 text-sm font-semibold text-[#fff4d6]">{profile ? "Редактирование профиля" : "Новый профиль"}</div>
      <form action={action} className="grid gap-3">
        {profile ? <input type="hidden" name="profileId" value={profile.id} /> : null}
        <Field label="Название">
          <Input name="name" required placeholder="Пул ru-1" defaultValue={profile?.name} />
        </Field>
        <Field label="Проект">
          <Select
            name="projectBindingId"
            required
            value={projectId}
            onChange={(event) => {
              const nextProjectId = event.target.value;
              const nextProject = projects.find((project) => project.id === nextProjectId);
              setProjectId(nextProjectId);
              setSelectedRegions(nextProject?.regions[0] ? [nextProject.regions[0]] : []);
            }}
          >
            {projects.length === 0 ? <option value="">Сначала синхронизируйте проекты</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-2 text-sm text-[#cfc2a4]">
          <div>Зоны</div>
          <div className="grid gap-3 rounded-md border border-[var(--line)] bg-black/20 p-3">
            {!selectedProject ? <div className="text-xs text-[var(--muted)]">Выберите проект</div> : null}
            {selectedProject && regions.length === 0 ? <div className="text-xs text-[var(--muted)]">Нет зон после синхронизации</div> : null}
            {Object.entries(regionGroups).map(([city, zones]) => (
              <div key={city} className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{city}</div>
                <div className="grid gap-1.5">
                  {zones.map((zone) => (
                    <label key={zone.name} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[#f6c453]/10">
                      <input
                        type="checkbox"
                        name="regions"
                        value={zone.name}
                        checked={selectedRegions.includes(zone.name)}
                        onChange={(event) => {
                          setSelectedRegions((current) =>
                            event.target.checked
                              ? [...new Set([...current, zone.name])]
                              : current.filter((item) => item !== zone.name),
                          );
                        }}
                        className="h-4 w-4 accent-[#f6c453]"
                      />
                      <span className="font-semibold text-[#fff4d6]">{zone.name}</span>
                      <span className="text-xs text-[var(--muted)]">{zone.label}</span>
                      {zone.badge ? (
                        <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-200">{zone.badge}</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        {selectedProject && regions.length === 0 ? (
          <div className="rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
            Для проекта нет сохраненных зон. Нажмите «Синхронизировать» на странице аккаунтов. Если зоны не появятся, проверьте роль сервисного пользователя: нужна `vpc.admin` на проект.
          </div>
        ) : null}
        <Field label="Целевые IP или CIDR, по одному в строке">
          <Textarea name="targets" required placeholder={"203.0.113.10\n198.51.100.0/24"} defaultValue={profile?.targets} />
        </Field>
        {isRegRu ? (
          <div className="grid gap-3 rounded-md border border-[#f6c453]/20 bg-[#f6c453]/5 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#f6c453]">Ожидание сервера Reg.ru</div>
            <div className="grid gap-3">
              <Field label="Проверка IP, сек">
                <Input name="serverWaitIntervalSeconds" type="number" defaultValue={profile?.serverWaitIntervalSeconds ?? 10} min={5} />
              </Field>
              <input type="hidden" name="serverWaitMaxSeconds" value={profile?.serverWaitMaxSeconds ?? 240} />
              <div className="text-xs leading-5 text-[#cbbf95]">IP ожидается без ограничения по времени. Остановить ожидание можно кнопкой остановки задачи.</div>
            </div>
          </div>
        ) : (
          <>
            <input type="hidden" name="serverWaitIntervalSeconds" value={profile?.serverWaitIntervalSeconds ?? 10} />
            <input type="hidden" name="serverWaitMaxSeconds" value={profile?.serverWaitMaxSeconds ?? 240} />
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Запросов в минуту">
            <Input name="requestsPerMinute" type="number" defaultValue={profile?.requestsPerMinute ?? 6} min={1} />
          </Field>
          <Field label="Мин. задержка, сек">
            <Input name="minDelaySeconds" type="number" defaultValue={profile?.minDelaySeconds ?? 10} min={1} />
          </Field>
          <Field label="Макс. задержка, сек">
            <Input name="maxDelaySeconds" type="number" defaultValue={profile?.maxDelaySeconds ?? 30} min={1} />
          </Field>
          <Field label="Пауза после ошибки, сек">
            <Input name="errorDelaySeconds" type="number" defaultValue={profile?.errorDelaySeconds ?? 60} min={1} />
          </Field>
          <Field label="Время работы, сек">
            <Input name="maxRuntimeSeconds" type="number" defaultValue={profile?.maxRuntimeSeconds ?? 3600} min={60} />
          </Field>
          <Field label="Лимит найденных IP">
            <Input name="maxFindings" type="number" defaultValue={profile?.maxFindings ?? 1} min={1} />
          </Field>
          <Field label="Мин. отдых, мин">
            <Input name="restMinMinutes" type="number" defaultValue={profile?.restMinMinutes ?? 10} min={1} />
          </Field>
          <Field label="Макс. отдых, мин">
            <Input name="restMaxMinutes" type="number" defaultValue={profile?.restMaxMinutes ?? 20} min={1} />
          </Field>
        </div>
        <Button type="submit" disabled={projects.length === 0 || regions.length === 0 || selectedRegions.length === 0}>
          {profile ? "Сохранить профиль" : "Создать профиль"}
        </Button>
      </form>
    </>
  );

  if (!framed) return <div className="rounded-md border border-[var(--line)] bg-black/20 p-3">{content}</div>;
  return <Card>{content}</Card>;
}

function regRuZoneGroups(regions: string[]) {
  const labels: Record<string, { city: string; label: string }> = {
    "openstack-msk1": { city: "Москва", label: "Основная зона" },
    "openstack-spb1": { city: "Санкт-Петербург", label: "Основная зона" },
    "openstack-msk2": { city: "Москва-2", label: "Зона доступности" },
    "openstack-sam1": { city: "Самара", label: "Зона доступности" },
  };
  return {
    "Зоны Reg.ru": regions.map((name) => ({
      name,
      city: labels[name]?.city ?? "Зоны Reg.ru",
      label: labels[name]?.label ?? "Зона доступности",
    })),
  };
}
