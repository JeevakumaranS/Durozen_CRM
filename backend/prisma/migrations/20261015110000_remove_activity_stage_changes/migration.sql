DELETE FROM "activities" WHERE "type" = 'STAGE_CHANGE';

ALTER TABLE "activities"
DROP COLUMN "previous_stage",
DROP COLUMN "new_stage";
