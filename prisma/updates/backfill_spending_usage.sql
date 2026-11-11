-- Run after adding Purchase and the Family.spentTotal column, while the app is stopped.
-- Idempotent: counts historical completed external-spend ledger entries once,
-- excluding the new purchase ledger rows, then adds confirmed new invoices.
UPDATE "Family" AS f
SET "spentTotal" =
  COALESCE((
    SELECT SUM(l."amount") FROM "LedgerEntry" AS l
    WHERE l."familyId" = f."id"
      AND l."direction" = 'DEBIT'
      AND l."status" = 'COMPLETED'
      AND l."type" IN ('SPEND_OPTION_A_PAYPAL', 'SPEND_OPTION_B_ORDER', 'DONATION')
      AND NOT EXISTS (SELECT 1 FROM "Purchase" AS p WHERE p."id" = l."referenceId")
  ), 0)
  + COALESCE((SELECT SUM(p."amount") FROM "Purchase" AS p WHERE p."familyId" = f."id" AND p."status" = 'PAID'), 0);
