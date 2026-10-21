ALTER TABLE "activities"
ADD COLUMN "requirement" TEXT,
ADD COLUMN "estimated_budget" DECIMAL,
ADD COLUMN "remarks" TEXT,
ADD COLUMN "follow_up_at" TIMESTAMP(3);
