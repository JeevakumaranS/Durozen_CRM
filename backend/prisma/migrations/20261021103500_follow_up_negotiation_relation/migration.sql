ALTER TABLE "follow_ups"
ADD COLUMN "negotiation_id" UUID;

CREATE INDEX "follow_ups_negotiation_id_idx"
ON "follow_ups"("negotiation_id");

UPDATE "follow_ups" AS follow_up
SET "negotiation_id" = (
  SELECT negotiation."id"
  FROM "negotiations" AS negotiation
  WHERE negotiation."lead_id" = follow_up."lead_id"
  ORDER BY negotiation."created_at" DESC
  LIMIT 1
)
WHERE follow_up."type" = 'Negotiation'
  AND EXISTS (
    SELECT 1
    FROM "negotiations" AS negotiation
    WHERE negotiation."lead_id" = follow_up."lead_id"
  );

ALTER TABLE "follow_ups"
ADD CONSTRAINT "follow_ups_negotiation_id_fkey"
FOREIGN KEY ("negotiation_id") REFERENCES "negotiations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
