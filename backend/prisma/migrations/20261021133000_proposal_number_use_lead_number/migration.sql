BEGIN;

DROP INDEX "proposals_proposal_number_key";

UPDATE "proposals" AS proposal
SET "proposal_number" = lead."lead_number"
FROM "leads" AS lead
WHERE proposal."lead_id" = lead."id";

COMMIT;
