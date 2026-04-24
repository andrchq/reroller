import { Boxes, ClipboardList, Home, KeyRound, LogOut, Radio, Settings, Target } from "lucide-react";
import { logoutAction } from "@/lib/actions";
import { LinkButton } from "@/components/ui";

const nav = [
  { href: "/", label: "Обзор", icon: Home },
  { href: "/accounts", label: "Аккаунты", icon: KeyRound },
  { href: "/profiles", label: "Профили", icon: Target },
  { href: "/runs", label: "Запуски и логи", icon: Radio },
  { href: "/findings", label: "Находки", icon: ClipboardList },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[var(--line)] bg-black/20 p-4 backdrop-blur lg:block">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f6c453] text-black">
            <Boxes size={20} />
          </div>
          <div>
            <div className="text-lg font-semibold">Reroller</div>
            <div className="text-xs text-[var(--muted)]">Панель подбора IP</div>
          </div>
        </div>
        <nav className="grid gap-1">
          {nav.map((item) => (
            <a key={item.href} href={item.href} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[#d8ceb8] hover:bg-[#f6c453]/10 hover:text-[#f6c453]">
              <item.icon size={16} />
              {item.label}
            </a>
          ))}
        </nav>
        <form action={logoutAction} className="absolute bottom-4 left-4 right-4">
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-[#9b927f] hover:bg-white/5 hover:text-white">
            <LogOut size={16} />
            Выйти
          </button>
        </form>
      </aside>
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-[var(--line)] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#fff4d6]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
      </div>
      {action ?? <LinkButton href="/">Обзор</LinkButton>}
    </div>
  );
}
