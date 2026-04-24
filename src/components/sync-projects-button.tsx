"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { syncProjectsAction } from "@/lib/actions";

type SyncMessage = {
  ok: boolean;
  title: string;
  message: string;
  details?: string;
};

export function SyncProjectsButton({ accountId }: { accountId: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<SyncMessage | null>(null);

  return (
    <div className="grid min-w-64 justify-items-end gap-2">
      <Button
        type="button"
        disabled={isPending}
        onClick={() => {
          const formData = new FormData();
          formData.set("accountDbId", accountId);
          setMessage(null);
          startTransition(async () => {
            const result = await syncProjectsAction(formData);
            setMessage(result);
          });
        }}
      >
        {isPending ? "Синхронизация..." : "Синхронизировать"}
      </Button>
      {message ? (
        <div
          className={
            message.ok
              ? "w-full rounded-md border border-emerald-400/25 bg-emerald-400/10 p-3 text-left text-xs text-emerald-100"
              : "w-full rounded-md border border-red-400/25 bg-red-400/10 p-3 text-left text-xs text-red-100"
          }
        >
          <div className="mb-1 font-semibold">{message.title}</div>
          <div className="leading-5">{message.message}</div>
          {message.details ? <div className="mt-2 leading-5 opacity-80">{message.details}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
