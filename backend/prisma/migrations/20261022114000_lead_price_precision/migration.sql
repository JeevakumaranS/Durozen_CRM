ALTER TABLE "leads"
  ALTER COLUMN "estimated_budget" TYPE DECIMAL(18, 2) USING ROUND("estimated_budget"::numeric, 2),
  ALTER COLUMN "final_deal_value" TYPE DECIMAL(18, 2) USING ROUND("final_deal_value"::numeric, 2),
  ALTER COLUMN "advance_amount" TYPE DECIMAL(18, 2) USING ROUND("advance_amount"::numeric, 2),
  ALTER COLUMN "paid_amount" TYPE DECIMAL(18, 2) USING ROUND("paid_amount"::numeric, 2);

ALTER TABLE "activities"
  ALTER COLUMN "estimated_budget" TYPE DECIMAL(18, 2) USING ROUND("estimated_budget"::numeric, 2),
  ALTER COLUMN "payment_amount" TYPE DECIMAL(18, 2) USING ROUND("payment_amount"::numeric, 2),
  ALTER COLUMN "payment_total" TYPE DECIMAL(18, 2) USING ROUND("payment_total"::numeric, 2),
  ALTER COLUMN "payment_balance" TYPE DECIMAL(18, 2) USING ROUND("payment_balance"::numeric, 2);

ALTER TABLE "negotiations"
  ALTER COLUMN "advance_amount" TYPE DECIMAL(18, 2) USING ROUND("advance_amount"::numeric, 2);
