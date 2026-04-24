import { AppShell, PageHeader } from "@/components/shell";
import { Badge, Button, Card } from "@/components/ui";
import { stopRunAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { logLevelLabel, runStatusLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  await requireUser();
  const params = await searchParams;
  const runs = await prisma.run.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { searchProfile: true, logs: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  const selected = runs.find((run) => run.id === params.run) ?? runs[0] ?? null;

  return (
    <AppShell>
      <PageHeader title="Запуски и логи" description="История фоновых задач и живой поток логов по выбранному запуску." />
      <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
        <Card>
          <div className="mb-3 text-sm font-semibold text-[#fff4d6]">Запуски</div>
          <div className="grid gap-2">
            {runs.map((run) => (
              <a key={run.id} href={`/runs?run=${run.id}`} className="rounded-md border border-[var(--line)] bg-black/20 p-3 hover:bg-[#f6c453]/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{run.searchProfile.name}</span>
                  <Badge tone={run.status === "FAILED" ? "bad" : run.status === "COMPLETED" ? "good" : "default"}>{runStatusLabel(run.status)}</Badge>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">Попыток: {run.attempts} / {run.createdAt.toLocaleString("ru-RU")}</div>
              </a>
            ))}
            {runs.length === 0 ? <div className="text-sm text-[var(--muted)]">Запусков пока нет.</div> : null}
          </div>
        </Card>
        <Card>
          {selected ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#fff4d6]">{selected.searchProfile.name}</div>
                  <div className="text-xs text-[var(--muted)]">ID запуска: {selected.id}</div>
                </div>
                {["QUEUED", "RUNNING"].includes(selected.status) ? (
                  <form action={stopRunAction}>
                    <input type="hidden" name="runId" value={selected.id} />
                    <Button type="submit" className="bg-red-300 hover:bg-red-200">Остановить</Button>
                  </form>
                ) : null}
              </div>
              <LiveLogs runId={selected.id} fallbackLogs={selected.logs.reverse()} />
            </>
          ) : (
            <div className="text-sm text-[var(--muted)]">Выберите запуск.</div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function LiveLogs({ runId, fallbackLogs }: { runId: string; fallbackLogs: { id: string; level: string; message: string; createdAt: Date }[] }) {
  return (
    <div>
      <div id="live-log-box" data-run-id={runId} className="h-[34rem] overflow-auto rounded-md bg-black/40 p-3 font-mono text-xs">
        {fallbackLogs.map((log) => (
          <div key={log.id} className="mb-1 grid grid-cols-[6rem_5rem_1fr] gap-2">
            <span className="text-[var(--muted)]">{log.createdAt.toLocaleTimeString("ru-RU")}</span>
            <span className={log.level === "ERROR" ? "text-red-300" : log.level === "SUCCESS" ? "text-emerald-300" : "text-[#f6c453]"}>{logLevelLabel(log.level)}</span>
            <span>{log.message}</span>
          </div>
        ))}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              const labels = { INFO: 'Инфо', WARN: 'Внимание', ERROR: 'Ошибка', SUCCESS: 'Успех' };
              const box = document.getElementById('live-log-box');
              if (!box || box.dataset.bound) return;
              box.dataset.bound = '1';
              const source = new EventSource('/api/runs/' + box.dataset.runId + '/logs');
              source.onmessage = function(event) {
                const log = JSON.parse(event.data);
                if (document.getElementById('log-' + log.id)) return;
                const row = document.createElement('div');
                row.id = 'log-' + log.id;
                row.className = 'mb-1 grid grid-cols-[6rem_5rem_1fr] gap-2';
                const time = new Date(log.createdAt).toLocaleTimeString('ru-RU');
                row.innerHTML = '<span class="text-[var(--muted)]">' + time + '</span><span class="' + (log.level === 'ERROR' ? 'text-red-300' : log.level === 'SUCCESS' ? 'text-emerald-300' : 'text-[#f6c453]') + '">' + (labels[log.level] || log.level) + '</span><span></span>';
                row.lastChild.textContent = log.message;
                box.appendChild(row);
                box.scrollTop = box.scrollHeight;
              };
            })();
          `,
        }}
      />
    </div>
  );
}
