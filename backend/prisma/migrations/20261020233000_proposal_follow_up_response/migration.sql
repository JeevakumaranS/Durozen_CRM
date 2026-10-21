ALTER TABLE "follow_ups"
ADD COLUMN "proposal_id" UUID;

ALTER TABLE "proposals"
ADD COLUMN "response_saved_at" TIMESTAMP(3);

CREATE INDEX "follow_ups_proposal_id_idx"
ON "follow_ups"("proposal_id");

ALTER TABLE "follow_ups"
ADD CONSTRAINT "follow_ups_proposal_id_fkey"
FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
