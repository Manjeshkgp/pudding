-- Sandbox demos intentionally allow the same PayPal payer on multiple Pudding users.
-- No user or token rows are deleted. Live ownership is checked under a DB lock in paypal-link.ts.
DROP INDEX IF EXISTS "User_paypalPayerId_key";
CREATE INDEX IF NOT EXISTS "User_paypalPayerId_idx" ON "User"("paypalPayerId");
