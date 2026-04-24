"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LiveLog = {
  id: string;
  level: string;
  message: string;
  createdAt: string;
};

const labels: Record<string, string> = {
  INFO: "Инфо",
  WARN: "Внимание",
  ERROR: "Ошибка",
  SUCCESS: "Успех",
};

function levelClass(level: string) {
  if (level === "ERROR") return "text-red-300";
  if (level === "SUCCESS") return "text-emerald-300";
  return "text-[#f6c453]";
}

export function LiveRunLogs({ runId, initialLogs }: { runId: string; initialLogs: LiveLog[] }) {
  const [logs, setLogs] = useState(initialLogs);
  const seenIds = useRef(new Set(initialLogs.map((log) => log.id)));
  const lastCreatedAt = useMemo(() => initialLogs.at(-1)?.createdAt ?? "", [initialLogs]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (lastCreatedAt) params.set("after", lastCreatedAt);

    const source = new EventSource(`/api/runs/${runId}/logs?${params.toString()}`);
    source.onmessage = (event) => {
      const log = JSON.parse(event.data) as LiveLog;
      if (seenIds.current.has(log.id)) return;
      seenIds.current.add(log.id);
      setLogs((current) => [...current, log]);
    };

    return () => source.close();
  }, [runId, lastCreatedAt]);

  return (
    <div className="h-[38rem] overflow-auto rounded-md bg-black/40 p-3 font-mono text-xs">
      {logs.map((log) => (
        <div key={log.id} className="mb-1 grid grid-cols-[6rem_6rem_1fr] gap-2">
          <span className="text-[var(--muted)]">{new Date(log.createdAt).toLocaleTimeString("ru-RU")}</span>
          <span className={levelClass(log.level)}>{labels[log.level] ?? log.level}</span>
          <span>{log.message}</span>
        </div>
      ))}
    </div>
  );
}
