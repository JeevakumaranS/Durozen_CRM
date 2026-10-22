ALTER TABLE "meetings"
  DROP COLUMN "participants",
  ALTER COLUMN "budget" TYPE DECIMAL(18, 2)
    USING ROUND("budget", 2);
