ALTER TABLE "AllowanceRule"
  ADD COLUMN IF NOT EXISTS "anchorAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "creationKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AllowanceRule_creationKey_key"
  ON "AllowanceRule"("creationKey");
