DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "meetings"
        WHERE "status" = 'SCHEDULED'
        GROUP BY "lead_id"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot enforce one scheduled meeting per lead: resolve existing leads with multiple scheduled meetings first.';
    END IF;
END $$;

CREATE UNIQUE INDEX "meetings_one_scheduled_per_lead_idx"
ON "meetings" ("lead_id")
WHERE "status" = 'SCHEDULED';
