"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { syncProjectsAction } from "@/lib/actions";

export function SyncProjectsButton({ accountId }: { accountId: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="grid justify-items-end gap-2">
      <Button
        type="button"
        disabled={isPending}
        onClick={() => {
          const formData = new FormData();
          formData.set("accountDbId", accountId);
          setMessage(null);
          startTransition(async () => {
            const result = await syncProjectsAction(formData);
            setMessage({ ok: result.ok, text: result.message });
          });
        }}
      >
        {isPending ? "Синхронизация..." : "Синхронизировать"}
      </Button>
      {message ? (
        <div className={message.ok ? "max-w-72 text-right text-xs text-emerald-200" : "max-w-72 text-right text-xs text-red-200"}>
          {message.text}
        </div>
      ) : null}
    </div>
  );
}
