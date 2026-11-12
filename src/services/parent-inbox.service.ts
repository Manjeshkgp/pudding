import { Prisma, type Notification } from "@prisma/client";
import { pageSize, type pageCursor } from "@/lib/list-page";
import prisma from "@/lib/prisma";

function parentInboxScope(familyId: string | null, userId: string) {
  const family =
    familyId === null
      ? Prisma.sql`n."familyId" IS NULL`
      : Prisma.sql`n."familyId" = ${familyId}`;
  return Prisma.sql`
    ${family}
    AND n."childId" IS NULL
    AND (n."userId" IS NULL OR n."userId" = ${userId})
    AND NOT (
      n.type = 'PURCHASE_UPDATE' AND (
        n.title = 'Purchase declined' OR (
          n.title = 'Purchase paid' AND EXISTS (
            SELECT 1 FROM "Purchase" p
            WHERE p.id = n.metadata->>'purchaseId'
              AND p."familyId" = n."familyId"
              AND p."reviewedByUserId" IS NOT NULL
          )
        )
      )
    )
  `;
}

export function listParentInbox(
  familyId: string | null,
  userId: string,
  unreadOnly: boolean,
  cursor: ReturnType<typeof pageCursor>,
) {
  const unread = unreadOnly ? Prisma.sql`AND NOT n."isRead"` : Prisma.empty;
  const before = cursor
    ? Prisma.sql`AND (n."createdAt", n.id) < (${cursor.date}, ${cursor.id})`
    : Prisma.empty;
  return prisma.$queryRaw<Notification[]>`
    SELECT n.* FROM "Notification" n
    WHERE ${parentInboxScope(familyId, userId)} ${unread} ${before}
    ORDER BY n."createdAt" DESC, n.id DESC
    LIMIT ${pageSize + 1}
  `;
}

export async function countUnreadParentInbox(
  familyId: string | null,
  userId: string,
) {
  const [result] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM "Notification" n
    WHERE ${parentInboxScope(familyId, userId)} AND NOT n."isRead"
  `;
  return result.count;
}
