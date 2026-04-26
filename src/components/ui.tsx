import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-2xl shadow-black/20", className)}
      {...props}
    />
  );
}

export function ListCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md border border-[var(--line)] bg-black/20 p-3 transition hover:border-[#f6c453]/30", className)}
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
        <div className="text-sm font-semibold text-[#fff4d6]">{title}</div>
        {description ? <div className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{description}</div> : null}
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
        tone === "good" && "border-emerald-300/25 bg-emerald-400/15 text-emerald-50",
        tone === "bad" && "border-red-300/25 bg-red-400/15 text-red-50",
        tone === "warn" && "border-amber-300/25 bg-amber-400/15 text-amber-50",
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
        "inline-flex h-9 items-center justify-center rounded-md bg-[#f6c453] px-3 text-sm font-semibold text-black transition hover:bg-[#ffd66f] disabled:opacity-50",
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
        "inline-flex h-9 items-center justify-center rounded-md border border-[var(--line)] px-3 text-sm font-medium text-[#f6c453] transition hover:bg-[#f6c453]/10",
        className,
      )}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="h-9 w-full rounded-md border border-[var(--line)] bg-black/30 px-3 text-sm outline-none transition placeholder:text-[#756c5c] focus:border-[#f6c453]/60"
      {...props}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="min-h-28 w-full rounded-md border border-[var(--line)] bg-black/30 px-3 py-2 text-sm outline-none transition placeholder:text-[#756c5c] focus:border-[#f6c453]/60"
      {...props}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="h-9 w-full rounded-md border border-[var(--line)] bg-[#090806] px-3 text-sm text-[#fff4d6] outline-none transition focus:border-[#f6c453]/60 [&_option]:bg-[#19150f] [&_option]:text-[#fff4d6] [&_option:disabled]:text-[#756c5c]"
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm text-[#cfc2a4]">
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
        tone === "good" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
        tone === "bad" && "border-red-400/30 bg-red-400/10 text-red-200",
        tone === "default" && "border-[#f6c453]/20 bg-[#f6c453]/10 text-[#f6c453]",
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
        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[#f6c453]/40 bg-[#f6c453]/10 text-xs font-semibold text-[#f6c453] outline-none transition hover:bg-[#f6c453]/20 focus:bg-[#f6c453]/20"
      >
        i
      </span>
      <span className="pointer-events-none absolute right-0 top-7 z-20 hidden w-80 rounded-md border border-[var(--line)] bg-[#19150f] p-3 text-left text-xs leading-5 text-[#f7f0df] shadow-2xl shadow-black/40 group-hover:block group-focus-within:block">
        {children}
      </span>
    </span>
  );
}
