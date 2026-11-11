import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { purchaseAccess } from "@/lib/purchase-access";
import { handleRouteError } from "@/lib/api-response";
export const runtime = "nodejs";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { purchase: p } = await purchaseAccess(
      req,
      (await context.params).id,
    );
    // The QR is a receipt snapshot, never a trusted payment instruction or token.
    const payload = JSON.stringify({
      type: "PUDDING_DEMO_INVOICE",
      version: 1,
      invoiceId: p.id,
      items: p.items,
      total: p.amount.toFixed(2),
      currency: p.currency,
    });
    const svg = await QRCode.toString(payload, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 4,
      width: 320,
    });
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
