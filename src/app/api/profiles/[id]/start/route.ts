import { requireUser } from "@/lib/auth";
import { enqueueRun } from "@/lib/queue";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const run = await prisma.run.create({ data: { searchProfileId: id, status: "QUEUED" } });
  await enqueueRun(run.id);
  return Response.json({ runId: run.id });
}
