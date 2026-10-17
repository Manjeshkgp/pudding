import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "./prisma";

export interface RequestMeta {
  ipAddress: string;
  userAgent: string;
}

export function getRequestMeta(req: NextRequest): RequestMeta {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const ipAddress = forwardedFor
    ? forwardedFor.split(",")[0].trim()
    : realIp || "127.0.0.1";
  const userAgent = req.headers.get("user-agent") || "unknown";

  return { ipAddress, userAgent };
}

export interface AuditLogInput {
  familyId?: string | null;
  actorUserId?: string | null;
  actorChildId?: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function writeAuditLog(
  input: AuditLogInput,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma;
  return client.auditLog.create({
    data: {
      familyId: input.familyId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorChildId: input.actorChildId ?? null,
      actorRole: input.actorRole,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      details: input.details
        ? (input.details as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
