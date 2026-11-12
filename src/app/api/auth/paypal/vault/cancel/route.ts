import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const setupTokenId =
    req.nextUrl.searchParams.get("approval_token_id") ||
    req.nextUrl.searchParams.get("setup_token_id") ||
    req.nextUrl.searchParams.get("token");
  if (setupTokenId) {
    await prisma.user.updateMany({
      where: { paypalSetupTokenId: setupTokenId },
      data: { paypalSetupTokenId: null },
    });
  }

  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL("/paypal?paypal_vault=cancelled", base));
}
