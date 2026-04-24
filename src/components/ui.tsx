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
      className="h-9 w-full rounded-md border border-[var(--line)] bg-black/30 px-3 text-sm outline-none transition focus:border-[#f6c453]/60"
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
