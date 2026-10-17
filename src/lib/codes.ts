import crypto from "crypto";
import prisma from "./prisma";

const FAMILY_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes ambiguous 0/O/1/I

export function generateRandomCode(length = 6): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += FAMILY_CODE_CHARS[bytes[i] % FAMILY_CODE_CHARS.length];
  }
  return result;
}

export async function generateUniqueFamilyCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRandomCode(6);
    const existing = await prisma.family.findUnique({
      where: { familyCode: code },
      select: { id: true },
    });
    if (!existing) {
      return code;
    }
  }
  return generateRandomCode(8);
}

export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("hex");
}
