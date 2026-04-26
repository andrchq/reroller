"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { syncProjectsAction } from "@/lib/actions";

export function SyncProjectsButton({ accountId }: { accountId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div>
      <Button
        type="button"
        disabled={isPending}
        onClick={() => {
          const formData = new FormData();
          formData.set("accountDbId", accountId);
          startTransition(async () => {
            const result = await syncProjectsAction(formData);
            const next = new URLSearchParams(searchParams.toString());
            next.set("noticeTone", result.ok ? "good" : "bad");
            next.set("noticeTitle", result.title);
            next.set("noticeMessage", result.message);
            if (result.details) next.set("noticeDetails", result.details);
            else next.delete("noticeDetails");
            router.replace(`${pathname}?${next.toString()}`, { scroll: false });
          });
        }}
      >
        {isPending ? "Синхронизация..." : "Синхронизировать"}
      </Button>
    </div>
  );
}
