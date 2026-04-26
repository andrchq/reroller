import { Boxes, ClipboardList, Home, KeyRound, LogOut, Radio, Settings, Target } from "lucide-react";
import { logoutAction } from "@/lib/actions";
import { LinkButton } from "@/components/ui";

const nav = [
  { href: "/", label: "Обзор", shortLabel: "Обзор", icon: Home },
  { href: "/accounts", label: "Аккаунты", shortLabel: "Акк.", icon: KeyRound },
  { href: "/profiles", label: "Профили", shortLabel: "Проф.", icon: Target },
  { href: "/tasks", label: "Задачи", shortLabel: "Задачи", icon: Radio },
  { href: "/findings", label: "Находки", shortLabel: "IP", icon: ClipboardList },
  { href: "/settings", label: "Настройки", shortLabel: "Настр.", icon: Settings },
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

      <main className="pb-28 lg:pl-64 lg:pb-0">
        <div className="w-full px-3 py-4 sm:px-5 lg:px-6 xl:px-8">{children}</div>
      </main>

      <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-6 gap-1 rounded-2xl border border-[#f6c453]/25 bg-[#12100c]/92 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl lg:hidden">
        {nav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-medium text-[#cfc2a4] transition hover:bg-[#f6c453]/10 hover:text-[#f6c453]"
          >
            <item.icon size={18} />
            <span className="max-w-full truncate">{item.shortLabel}</span>
          </a>
        ))}
      </nav>
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
