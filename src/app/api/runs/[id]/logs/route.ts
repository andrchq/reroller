import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const encoder = new TextEncoder();
  const after = new URL(request.url).searchParams.get("after");
  let lastCreatedAt = after ? new Date(after) : new Date(0);
  if (Number.isNaN(lastCreatedAt.getTime())) lastCreatedAt = new Date(0);
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      while (!closed) {
        const logs = await prisma.runLog.findMany({
          where: { runId: id, createdAt: { gt: lastCreatedAt } },
          orderBy: { createdAt: "asc" },
          take: 50,
        });

        for (const log of logs) {
          lastCreatedAt = log.createdAt;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ id: log.id, level: log.level, message: log.message, createdAt: log.createdAt })}\n\n`),
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
