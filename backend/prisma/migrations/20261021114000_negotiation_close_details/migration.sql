ALTER TABLE "negotiations"
ADD COLUMN "expected_timeline" TEXT,
ADD COLUMN "confirmed_at" TIMESTAMP(3),
ADD COLUMN "payment_status" TEXT,
ADD COLUMN "advance_amount" DECIMAL(12,2);
