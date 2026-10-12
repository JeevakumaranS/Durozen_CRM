ALTER TABLE "leads"
ADD COLUMN "won_service" TEXT,
ADD COLUMN "payment_status" TEXT,
ADD COLUMN "expected_start_date" TIMESTAMP(3),
ADD COLUMN "won_remarks" TEXT;