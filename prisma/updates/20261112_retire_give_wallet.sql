BEGIN;

LOCK TABLE "Wallet" IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  wallet_total_before NUMERIC;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Wallet' AND column_name = 'giveBalance'
  ) THEN
    IF EXISTS (SELECT 1 FROM "Wallet" WHERE "giveBalance" < 0) THEN
      RAISE EXCEPTION 'Cannot retire Give while a wallet has a negative Give balance';
    END IF;
    SELECT COALESCE(SUM("spendBalance" + "saveBalance" + "giveBalance"), 0)
    INTO wallet_total_before FROM "Wallet";

    -- Preserve the old ledger and show the balance move on the statement.
    INSERT INTO "LedgerEntry" (
      "id", "familyId", "childId", "walletBucket", "amount", "direction",
      "type", "status", "idempotencyKey", "referenceId", "description"
    )
    SELECT
      'retire-give-' || w."id" || '-' || movement.key,
      c."familyId", w."childId", movement.bucket, w."giveBalance",
      movement.direction, 'BUCKET_TRANSFER', 'COMPLETED',
      'retire-give:' || w."id" || ':' || movement.key,
      w."id", 'Moved remaining Give balance to Savings'
    FROM "Wallet" w
    JOIN "Child" c ON c."id" = w."childId"
    CROSS JOIN (
      VALUES
        ('debit', 'GIVE'::"WalletBucket", 'DEBIT'::"LedgerDirection"),
        ('credit', 'SAVE'::"WalletBucket", 'CREDIT'::"LedgerDirection")
    ) AS movement(key, bucket, direction)
    WHERE w."giveBalance" > 0;

    UPDATE "Wallet"
    SET "saveBalance" = "saveBalance" + "giveBalance",
        "defaultSplitSave" = 100 - "defaultSplitSpend",
        "updatedAt" = CURRENT_TIMESTAMP;

    IF wallet_total_before <> (SELECT COALESCE(SUM("spendBalance" + "saveBalance"), 0) FROM "Wallet") THEN
      RAISE EXCEPTION 'Wallet balances did not reconcile after retiring Give';
    END IF;

    ALTER TABLE "Wallet" DROP COLUMN "giveBalance", DROP COLUMN "defaultSplitGive";
  END IF;
END
$$;

ALTER TABLE "Wallet" ALTER COLUMN "defaultSplitSave" SET DEFAULT 30;

COMMIT;
