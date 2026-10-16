BEGIN;

CREATE TABLE "lead_number_sequences" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL,
    CONSTRAINT "lead_number_sequences_pkey" PRIMARY KEY ("year")
);

INSERT INTO "lead_number_sequences" ("year", "last_number")
SELECT
    substring("lead_number" FROM '^DZN-([0-9]{4})-[0-9]{5,}$')::INTEGER,
    MAX(substring("lead_number" FROM '^DZN-[0-9]{4}-([0-9]{5,})$')::INTEGER)
FROM "leads"
WHERE "lead_number" ~ '^DZN-[0-9]{4}-[0-9]{5,}$'
GROUP BY 1;

COMMIT;
