import { NextRequest, NextResponse } from "next/server";
import {
  LedgerEntryType,
  LedgerStatus,
  Prisma,
  WalletBucket,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import { handleRouteError } from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";

function escapeCsvCell(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generates a valid, self-contained single-page/multi-line PDF buffer using standard PDF 1.4 syntax
 * with zero external native binary dependencies (FR-10.2).
 */
function buildSimplePdfReport(
  familyName: string,
  currency: string,
  rows: Array<{
    date: string;
    childName: string;
    type: string;
    bucket: string;
    direction: string;
    amount: string;
    status: string;
    description: string;
  }>,
): Buffer {
  const escapePdfText = (txt: string) =>
    txt
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/[^\x20-\x7E]/g, "");

  const lines: string[] = [
    `Pudding Transaction Statement - ${familyName}`,
    `Generated: ${new Date().toISOString().slice(0, 10)} | Currency: ${currency}`,
    "--------------------------------------------------------------------------------",
    "Date       | Child        | Bucket        | Dir    | Amount    | Status    | Description",
    "--------------------------------------------------------------------------------",
  ];

  for (const r of rows.slice(0, 45)) {
    const line = `${r.date.padEnd(10)} | ${r.childName.slice(0, 12).padEnd(12)} | ${r.bucket.slice(0, 13).padEnd(13)} | ${r.direction.padEnd(6)} | $${r.amount.padStart(8)} | ${r.status.slice(0, 9).padEnd(9)} | ${r.description.slice(0, 32)}`;
    lines.push(line);
  }

  let contentStream = "BT\n/F1 9 Tf\n36 756 Td\n13 TL\n";
  for (const line of lines) {
    contentStream += `(${escapePdfText(line)}) Tj T*\n`;
  }
  contentStream += "ET";

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

/**
 * GET /api/transactions/export?format=csv|pdf&childId=...&type=...&startDate=...&endDate=...
 * Exports filtered family transaction history as downloadable CSV or PDF (FR-10.2).
 */
export async function GET(req: NextRequest) {
  try {
    const { family } = await requireParent(req);

    const format = (
      req.nextUrl.searchParams.get("format") || "csv"
    ).toLowerCase();
    const childIdParam = req.nextUrl.searchParams.get("childId");
    const typeParam = req.nextUrl.searchParams.get(
      "type",
    ) as LedgerEntryType | null;
    const bucketParam = req.nextUrl.searchParams.get(
      "bucket",
    ) as WalletBucket | null;
    const statusParam = req.nextUrl.searchParams.get(
      "status",
    ) as LedgerStatus | null;
    const startDateParam = req.nextUrl.searchParams.get("startDate");
    const endDateParam = req.nextUrl.searchParams.get("endDate");

    const where: Prisma.LedgerEntryWhereInput = {
      familyId: family.id,
      ...(childIdParam ? { childId: childIdParam } : {}),
      ...(typeParam ? { type: typeParam } : {}),
      ...(bucketParam ? { walletBucket: bucketParam } : {}),
      ...(statusParam ? { status: statusParam } : {}),
      ...(startDateParam || endDateParam
        ? {
            createdAt: {
              ...(startDateParam ? { gte: new Date(startDateParam) } : {}),
              ...(endDateParam ? { lte: new Date(endDateParam) } : {}),
            },
          }
        : {}),
    };

    const entries = await prisma.ledgerEntry.findMany({
      where,
      include: {
        child: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const formattedRows = entries.map((e) => ({
      id: e.id,
      date: e.createdAt.toISOString().slice(0, 10),
      timestamp: e.createdAt.toISOString(),
      childName: e.child?.name || "Family Budget",
      type: e.type,
      bucket: e.walletBucket,
      direction: e.direction,
      amount: e.amount.toFixed(2),
      status: e.status,
      paypalOrderId: e.paypalOrderId || "",
      description: e.description,
    }));

    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === "pdf") {
      const pdfBuffer = buildSimplePdfReport(
        family.name,
        family.currency,
        formattedRows,
      );

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="goodspend-transactions-${dateStamp}.pdf"`,
        },
      });
    }

    // Default: CSV export
    const headers = [
      "Transaction ID",
      "Timestamp",
      "Child / Account",
      "Type",
      "Bucket",
      "Direction",
      "Amount",
      "Currency",
      "Status",
      "PayPal Order ID",
      "Description",
    ];

    const csvLines = [
      headers.join(","),
      ...formattedRows.map((r) =>
        [
          escapeCsvCell(r.id),
          escapeCsvCell(r.timestamp),
          escapeCsvCell(r.childName),
          escapeCsvCell(r.type),
          escapeCsvCell(r.bucket),
          escapeCsvCell(r.direction),
          escapeCsvCell(r.amount),
          escapeCsvCell(family.currency),
          escapeCsvCell(r.status),
          escapeCsvCell(r.paypalOrderId),
          escapeCsvCell(r.description),
        ].join(","),
      ),
    ];

    return new NextResponse(csvLines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="goodspend-transactions-${dateStamp}.csv"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
