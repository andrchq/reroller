import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  await prisma.run.update({ where: { id }, data: { status: "STOPPED", stoppedAt: new Date() } });
  return Response.json({ ok: true });
}
