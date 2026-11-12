import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireParent } from "@/lib/auth-guard";
import { ApiError } from "@/lib/api-response";
export async function purchaseAccess(req: NextRequest, id: string) {
  const session = await requireAuth(req);
  const parent =
    session.subjectType === "USER" ? await requireParent(req) : null;
  const purchase = await prisma.purchase.findFirst({
    where: {
      id,
      familyId: parent?.family.id ?? session.familyId!,
      ...(session.subjectType === "CHILD" ? { childId: session.sub } : {}),
    },
    include: { child: { select: { name: true, avatar: true } } },
  });
  if (!purchase)
    throw new ApiError(404, "Purchase not found.", "PURCHASE_NOT_FOUND");
  return { session, purchase, parent };
}
