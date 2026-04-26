"use client";

import { useState } from "react";
import { Button, Field, InfoTip, Input, Select } from "@/components/ui";
import { createAccountAction, updateAccountAction } from "@/lib/actions";

type Provider = "selectel" | "timeweb" | "regru";

const providerHints: Record<Provider, string> = {
  selectel: "Нужны данные service user: ID аккаунта, имя пользователя и пароль.",
  timeweb: "Нужен только API token из панели Timeweb Cloud.",
  regru: "Нужен CloudVPS API token из настроек облачного окружения Reg.ru.",
};

type AccountDefaults = {
  id: string;
  name: string;
  provider: Provider;
  accountId: string;
  username: string;
};

export function AccountForm({ account, framedTitle = true }: { account?: AccountDefaults; framedTitle?: boolean }) {
  const [provider, setProvider] = useState<Provider>(account?.provider ?? "selectel");
  const action = account ? updateAccountAction : createAccountAction;

  return (
    <form action={action} className="grid gap-4">
      {account ? <input type="hidden" name="accountDbId" value={account.id} /> : null}
      {framedTitle ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[#fff4d6]">{account ? "Редактировать аккаунт" : "Добавить провайдера"}</div>
          <InfoTip label="Какие данные нужны">
            Для Selectel укажите service user credentials. Для Timeweb Cloud и Reg.ru укажите API token.
          </InfoTip>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            defaultValue={account?.name}
            placeholder={provider === "selectel" ? "Selectel основной" : provider === "timeweb" ? "Timeweb основной" : "Reg.ru основной"}
          />
        </Field>

        {provider === "selectel" ? (
          <>
            <Field label="ID аккаунта Selectel">
              <Input name="accountId" required defaultValue={account?.provider === "selectel" ? account.accountId : ""} placeholder="580835" />
            </Field>
            <Field label="Имя service user Selectel">
              <Input name="username" required defaultValue={account?.provider === "selectel" ? account.username : ""} placeholder="service-user" />
            </Field>
            <Field label="Пароль service user Selectel">
              <Input name="password" type="password" required={!account} autoComplete="new-password" placeholder={account ? "Оставьте пустым, если пароль не меняется" : ""} />
            </Field>
          </>
        ) : provider === "timeweb" ? (
          <Field label="API token Timeweb Cloud">
            <Input name="password" type="password" required={!account} autoComplete="new-password" placeholder={account ? "Оставьте пустым, если token не меняется" : "eyJ..."} />
          </Field>
        ) : (
          <Field label="CloudVPS API token Reg.ru">
            <Input name="password" type="password" required={!account} autoComplete="new-password" placeholder={account ? "Оставьте пустым, если token не меняется" : "0123456789abcdef"} />
          </Field>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_15rem] lg:items-end">
        <div className="rounded-md border border-[var(--line)] bg-black/20 px-3 py-2 text-xs leading-5 text-[#cfc2a4]">
          {providerHints[provider]}
        </div>
        <Button type="submit">{account ? "Сохранить изменения" : "Сохранить аккаунт"}</Button>
      </div>
    </form>
  );
}
