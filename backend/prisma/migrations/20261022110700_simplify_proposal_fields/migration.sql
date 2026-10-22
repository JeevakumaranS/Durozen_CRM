ALTER TABLE "proposals"
  DROP COLUMN "proposal_number",
  DROP COLUMN "validity_until",
  DROP COLUMN "sent_at",
  ALTER COLUMN "proposal_amount" TYPE DECIMAL(18, 2)
    USING ROUND("proposal_amount", 2),
  ALTER COLUMN "discount" TYPE DECIMAL(18, 2)
    USING ROUND("discount", 2),
  ALTER COLUMN "tax" TYPE DECIMAL(18, 2)
    USING ROUND("tax", 2),
  ALTER COLUMN "final_amount" TYPE DECIMAL(18, 2)
    USING ROUND("final_amount", 2);
