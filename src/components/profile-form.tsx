"use client";

import { useMemo, useState } from "react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { createProfileAction } from "@/lib/actions";

type ProjectOption = {
  id: string;
  label: string;
  regions: string[];
};

export function ProfileForm({ projects }: { projects: ProjectOption[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projectId, projects],
  );
  const regions = selectedProject?.regions ?? [];

  return (
    <Card>
      <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Новый профиль</div>
      <form action={createProfileAction} className="grid gap-3">
        <Field label="Название">
          <Input name="name" required placeholder="Пул ru-1" />
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
          <Select name="region" required disabled={!selectedProject || regions.length === 0}>
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
          <Textarea name="targets" required placeholder={"203.0.113.10\n198.51.100.0/24"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Запросов в минуту">
            <Input name="requestsPerMinute" type="number" defaultValue={6} min={1} />
          </Field>
          <Field label="Мин. задержка, мс">
            <Input name="minDelayMs" type="number" defaultValue={10000} min={1000} />
          </Field>
          <Field label="Пакет запросов">
            <Input name="burst" type="number" defaultValue={1} min={1} />
          </Field>
          <Field label="Пауза после ошибки, мс">
            <Input name="cooldownAfterError" type="number" defaultValue={60000} min={1000} />
          </Field>
          <Field label="Макс. попыток">
            <Input name="maxAttempts" type="number" defaultValue={100} min={1} />
          </Field>
        </div>
        <Button type="submit" disabled={projects.length === 0 || regions.length === 0}>
          Создать профиль
        </Button>
      </form>
    </Card>
  );
}
