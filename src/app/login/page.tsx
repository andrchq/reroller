import { redirect } from "next/navigation";
import { Button, Card, Field, Input } from "@/components/ui";
import { createInitialAdminAction, loginAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const params = await searchParams;
  const hasUsers = (await prisma.user.count()) > 0;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6">
          <div className="mb-2 text-3xl font-semibold text-[#fff4d6]">Reroller</div>
          <p className="text-sm text-[var(--muted)]">
            {hasUsers ? "Войдите в приватную панель." : "Создайте первого администратора."}
          </p>
        </div>
        {params.error ? <div className="mb-4 rounded-md border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">Неверный логин или пароль.</div> : null}
        <form action={hasUsers ? loginAction : createInitialAdminAction} className="grid gap-4">
          <Field label="Логин">
            <Input name="login" type="text" autoComplete="username" required />
          </Field>
          <Field label="Пароль">
            <Input name="password" type="password" autoComplete={hasUsers ? "current-password" : "new-password"} required minLength={8} />
          </Field>
          <Button type="submit">{hasUsers ? "Войти" : "Создать администратора"}</Button>
        </form>
      </Card>
    </main>
  );
}
