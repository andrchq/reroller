"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { createAccountAction } from "@/lib/actions";

type Provider = "selectel" | "timeweb" | "regru";

const providerHints: Record<Provider, string> = {
  selectel: "Нужны данные service user: ID аккаунта, имя пользователя и пароль.",
  timeweb: "Нужен только API token из панели Timeweb Cloud.",
  regru: "Нужен CloudVPS API token из настроек облачного окружения Reg.ru.",
};

export function AccountForm() {
  const [provider, setProvider] = useState<Provider>("selectel");

  return (
    <form action={createAccountAction} className="flex min-h-[25rem] flex-col">
      <div className="grid gap-3">
        <Field label="Провайдер">
          <Select
            name="provider"
            required
            value={provider}
            onChange={(event) => setProvider(event.target.value as Provider)}
          >
            <option value="selectel">Selectel</option>
            <option value="timeweb">Timeweb Cloud</option>
            <option value="regru">Reg.ru CloudVPS</option>
          </Select>
        </Field>

        <Field label="Название">
          <Input
            name="name"
            required
            placeholder={provider === "selectel" ? "Selectel основной" : provider === "timeweb" ? "Timeweb основной" : "Reg.ru основной"}
          />
        </Field>

        {provider === "selectel" ? (
          <>
            <Field label="ID аккаунта Selectel">
              <Input name="accountId" required placeholder="580835" />
            </Field>
            <Field label="Имя service user Selectel">
              <Input name="username" required placeholder="service-user" />
            </Field>
            <Field label="Пароль service user Selectel">
              <Input name="password" type="password" required autoComplete="new-password" />
            </Field>
          </>
        ) : provider === "timeweb" ? (
          <Field label="API token Timeweb Cloud">
            <Input name="password" type="password" required autoComplete="new-password" placeholder="eyJ..." />
          </Field>
        ) : (
          <Field label="CloudVPS API token Reg.ru">
            <Input name="password" type="password" required autoComplete="new-password" placeholder="0123456789abcdef" />
          </Field>
        )}
      </div>

      <div className="mt-auto grid gap-3 pt-4">
        <div className="min-h-10 rounded-md border border-[var(--line)] bg-black/20 px-3 py-2 text-xs leading-5 text-[#cfc2a4]">
          {providerHints[provider]}
        </div>
        <Button type="submit">Сохранить аккаунт</Button>
      </div>
    </form>
  );
}
