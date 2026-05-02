import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_18px_70px_rgba(0,0,0,0.38)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}

export function ListCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--line)] bg-white/[0.025] p-3 transition hover:border-[var(--line-strong)] hover:bg-white/[0.045]",
        className,
      )}
      {...props}
    />
  );
}

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        {description ? <div className="mt-0.5 max-w-4xl text-xs leading-5 text-[var(--muted)]">{description}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function PageNotice({
  tone = "good",
  title,
  message,
  details,
  className,
}: {
  tone?: "good" | "bad" | "warn";
  title: string;
  message?: string;
  details?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-4 w-full rounded-2xl border px-4 py-3 text-sm shadow-2xl shadow-black/30 backdrop-blur",
        tone === "good" && "border-emerald-300/25 bg-emerald-400/12 text-emerald-50",
        tone === "bad" && "border-red-300/25 bg-red-400/12 text-red-50",
        tone === "warn" && "border-amber-300/25 bg-amber-400/12 text-amber-50",
        className,
      )}
    >
      <div className="font-semibold">{title}</div>
      {message ? <div className="mt-1 leading-5">{message}</div> : null}
      {details ? <div className="mt-2 whitespace-pre-line leading-5 opacity-85">{details}</div> : null}
    </div>
  );
}

export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-white px-3 text-sm font-semibold text-black shadow-[0_10px_34px_rgba(255,255,255,0.08)] transition hover:bg-zinc-200 disabled:pointer-events-none disabled:opacity-45",
        className,
      )}
      {...props}
    />
  );
}

export function LinkButton({ className, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg border border-[var(--line)] bg-white/[0.025] px-3 text-sm font-medium text-white transition hover:border-[var(--line-strong)] hover:bg-white/[0.075]",
        className,
      )}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="h-9 w-full rounded-lg border border-[var(--line)] bg-black/35 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-white/45 focus:bg-black/50"
      {...props}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="min-h-28 w-full rounded-lg border border-[var(--line)] bg-black/35 px-3 py-2 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-white/45 focus:bg-black/50"
      {...props}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="h-9 w-full rounded-lg border border-[var(--line)] bg-[#090909] px-3 text-sm text-white outline-none transition focus:border-white/45 [&_option]:bg-[#151515] [&_option]:text-white [&_option:disabled]:text-zinc-600"
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm text-[var(--muted-strong)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "good" | "bad" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "good" && "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
        tone === "bad" && "border-red-400/25 bg-red-400/10 text-red-200",
        tone === "default" && "border-white/15 bg-white/[0.055] text-zinc-200",
      )}
    >
      {children}
    </span>
  );
}

export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex align-middle">
      <span
        aria-label={label}
        tabIndex={0}
        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-white/25 bg-white/5 text-xs font-semibold text-white outline-none transition hover:bg-white/10 focus:bg-white/10"
      >
        i
      </span>
      <span className="pointer-events-none absolute right-0 top-7 z-20 hidden w-80 rounded-xl border border-[var(--line)] bg-[#121212] p-3 text-left text-xs leading-5 text-zinc-100 shadow-2xl shadow-black/50 group-hover:block group-focus-within:block">
        {children}
      </span>
    </span>
  );
}
