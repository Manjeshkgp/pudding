UPDATE "AllowanceRule"
SET "status" = 'PAUSED', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'ACTIVE' AND "frequency" NOT IN ('WEEKLY', 'MONTHLY');
