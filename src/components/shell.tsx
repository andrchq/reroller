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
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-[var(--line)] bg-black/70 p-4 shadow-[24px_0_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl lg:block">
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black">
              <Boxes size={20} />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight text-white">Reroller</div>
              <div className="text-xs text-[var(--muted)]">Панель подбора IP</div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Provider operations
          </div>
        </div>

        <nav className="grid gap-1.5">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm text-zinc-300 transition hover:border-white/10 hover:bg-white/[0.055] hover:text-white"
            >
              <item.icon size={16} />
              {item.label}
            </a>
          ))}
        </nav>

        <form action={logoutAction} className="absolute bottom-4 left-4 right-4">
          <button className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm text-zinc-500 transition hover:border-white/10 hover:bg-white/[0.055] hover:text-white">
            <LogOut size={16} />
            Выйти
          </button>
        </form>
      </aside>

      <main className="pb-28 lg:pl-72 lg:pb-0">
        <div className="w-full px-3 py-4 sm:px-5 lg:px-6 xl:px-8 2xl:px-10">{children}</div>
      </main>

      <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-6 gap-1 rounded-2xl border border-white/10 bg-black/85 p-2 shadow-2xl shadow-black/70 backdrop-blur-2xl lg:hidden">
        {nav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-medium text-zinc-400 transition hover:bg-white/10 hover:text-white"
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
    <div className="mb-5 flex flex-col gap-3 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Reroller console</div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
      </div>
      {action ?? <LinkButton href="/">Обзор</LinkButton>}
    </div>
  );
}
