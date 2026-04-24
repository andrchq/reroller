"use client";

import { useMemo, useState } from "react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { createProfileAction, updateProfileAction } from "@/lib/actions";

type ProjectOption = {
  id: string;
  label: string;
  regions: string[];
};

type ProfileDefaults = {
  id: string;
  name: string;
  projectBindingId: string;
  region: string;
  targets: string;
  requestsPerMinute: number;
  minDelayMs: number;
  burst: number;
  cooldownAfterError: number;
  maxAttempts: number;
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
          <Select name="projectBindingId" required value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            {projects.length === 0 ? <option value="">Сначала синхронизируйте проекты</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Регион">
          <Select name="region" required disabled={!selectedProject || regions.length === 0} defaultValue={profile?.region}>
            {!selectedProject ? <option value="">Выберите проект</option> : null}
            {selectedProject && regions.length === 0 ? <option value="">Нет регионов после синхронизации</option> : null}
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </Select>
        </Field>
        {selectedProject && regions.length === 0 ? (
          <div className="rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
            Для проекта нет сохраненных регионов. Нажмите «Синхронизировать» на странице аккаунтов. Если регионы не появятся, проверьте роль сервисного пользователя: нужна `vpc.admin` на проект.
          </div>
        ) : null}
        <Field label="Целевые IP или CIDR, по одному в строке">
          <Textarea name="targets" required placeholder={"203.0.113.10\n198.51.100.0/24"} defaultValue={profile?.targets} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Запросов в минуту">
            <Input name="requestsPerMinute" type="number" defaultValue={profile?.requestsPerMinute ?? 6} min={1} />
          </Field>
          <Field label="Мин. задержка, мс">
            <Input name="minDelayMs" type="number" defaultValue={profile?.minDelayMs ?? 10000} min={1000} />
          </Field>
          <Field label="Пакет запросов">
            <Input name="burst" type="number" defaultValue={profile?.burst ?? 1} min={1} />
          </Field>
          <Field label="Пауза после ошибки, мс">
            <Input name="cooldownAfterError" type="number" defaultValue={profile?.cooldownAfterError ?? 60000} min={1000} />
          </Field>
          <Field label="Макс. попыток">
            <Input name="maxAttempts" type="number" defaultValue={profile?.maxAttempts ?? 100} min={1} />
          </Field>
        </div>
        <Button type="submit" disabled={projects.length === 0 || regions.length === 0}>
          {profile ? "Сохранить профиль" : "Создать профиль"}
        </Button>
      </form>
    </>
  );

  if (!framed) return <div className="rounded-md border border-[var(--line)] bg-black/20 p-3">{content}</div>;
  return <Card>{content}</Card>;
}
