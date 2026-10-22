ALTER TABLE "negotiations"
  DROP COLUMN "competitor_information",
  ALTER COLUMN "original_proposal_amount" TYPE DECIMAL(18, 2)
    USING ROUND("original_proposal_amount", 2),
  ALTER COLUMN "customer_expected_amount" TYPE DECIMAL(18, 2)
    USING ROUND("customer_expected_amount", 2),
  ALTER COLUMN "negotiated_amount" TYPE DECIMAL(18, 2)
    USING ROUND("negotiated_amount", 2);
