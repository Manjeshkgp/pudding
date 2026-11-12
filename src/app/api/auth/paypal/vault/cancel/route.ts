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

  return new NextResponse(null, { status: 307, headers: { Location: "/paypal?paypal_vault=cancelled" } });
}
