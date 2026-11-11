import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireParent } from "@/lib/auth-guard";
import { ApiError } from "@/lib/api-response";
export const MAX_EVIDENCE_BYTES = 512 * 1024;
export async function readEvidenceForm(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data;") || !req.body)
    throw new ApiError(400, "Upload the photo as multipart form data.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_EVIDENCE_BYTES + 16384) {
      await reader.cancel();
      throw new ApiError(413, "Photo must be smaller than 512 KB.");
    }
    chunks.push(value);
  }
  try {
    return await new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new ApiError(400, "Invalid photo upload. Please retry.");
  }
}
export async function choreAccess(req: NextRequest, choreId: string) {
  const session = await requireAuth(req);
  if (session.subjectType === "USER")
    await requireParent(req, "canApproveChores");
  const chore = await prisma.chore.findUnique({ where: { id: choreId } });
  if (
    !chore ||
    chore.familyId !== session.familyId ||
    (session.subjectType === "CHILD" &&
      !chore.assigneeIds.includes(session.sub))
  )
    throw new ApiError(404, "Task not found.", "CHORE_NOT_FOUND");
  return { session, chore };
}
export function imageMatchesMime(bytes: Buffer, mime: string) {
  if (mime === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png")
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp")
    return (
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    );
  return false;
}
