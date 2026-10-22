BEGIN;

ALTER TABLE "leads"
ADD COLUMN "paid_amount" DECIMAL(65,30) NOT NULL DEFAULT 0;

UPDATE "leads"
SET "paid_amount" = CASE
    WHEN "payment_status" IN ('Fully Paid', 'Paid')
        THEN COALESCE("final_deal_value", 0)
    WHEN "payment_status" IN (
        'Advance Payment',
        'Partially Paid',
        'Partial Payment'
    ) THEN COALESCE("advance_amount", 0)
    ELSE 0
END;

ALTER TABLE "activities"
ADD COLUMN "payment_amount" DECIMAL(65,30),
ADD COLUMN "payment_status" TEXT,
ADD COLUMN "payment_total" DECIMAL(65,30),
ADD COLUMN "payment_balance" DECIMAL(65,30);

INSERT INTO "activities" (
    "id",
    "lead_id",
    "type",
    "description",
    "outcome",
    "payment_amount",
    "payment_status",
    "payment_total",
    "payment_balance",
    "created_at"
)
SELECT
    gen_random_uuid(),
    lead."id",
    'PAYMENT_RECEIVED',
    CASE
        WHEN lead."paid_amount" = lead."final_deal_value"
            THEN 'Fully Paid recorded'
        ELSE 'Advance Payment recorded'
    END,
    'Initial payment status recorded when deal was won',
    lead."paid_amount",
    CASE
        WHEN lead."paid_amount" = lead."final_deal_value"
            THEN 'Fully Paid'
        ELSE 'Advance Payment'
    END,
    lead."paid_amount",
    lead."final_deal_value" - lead."paid_amount",
    COALESCE(lead."confirmed_at", lead."updated_at")
FROM "leads" AS lead
WHERE lead."stage" = 'WON'
  AND lead."paid_amount" > 0
  AND lead."final_deal_value" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "activities" AS activity
      WHERE activity."lead_id" = lead."id"
        AND activity."type" = 'PAYMENT_RECEIVED'
  );

COMMIT;
