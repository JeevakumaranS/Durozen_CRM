BEGIN;

CREATE TABLE "calls_messages" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "user_id" UUID,
    "due_at" TIMESTAMP(3) NOT NULL,
    "contact_method" TEXT NOT NULL,
    "description" TEXT,
    "outcome" TEXT,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "calls_messages_pkey" PRIMARY KEY ("id")
);

INSERT INTO "calls_messages" (
    "id",
    "lead_id",
    "due_at",
    "contact_method",
    "description",
    "status",
    "completed_at",
    "created_at",
    "updated_at"
)
SELECT
    "id",
    "lead_id",
    "due_at",
    CASE lower(trim("next_action"))
        WHEN 'call' THEN 'Phone Call'
        WHEN 'phone call' THEN 'Phone Call'
        WHEN 'whatsapp' THEN 'WhatsApp'
        WHEN 'email' THEN 'Email'
    END,
    "remarks",
    "status",
    CASE WHEN "status" = 'COMPLETED' THEN "updated_at" ELSE NULL END,
    "created_at",
    "updated_at"
FROM "follow_ups"
WHERE lower(trim("next_action")) IN ('call', 'phone call', 'whatsapp', 'email');

DELETE FROM "follow_ups"
WHERE lower(trim("next_action")) IN ('call', 'phone call', 'whatsapp', 'email');

CREATE INDEX "calls_messages_status_due_at_idx"
ON "calls_messages"("status", "due_at");

CREATE INDEX "calls_messages_lead_id_created_at_idx"
ON "calls_messages"("lead_id", "created_at");

ALTER TABLE "calls_messages"
ADD CONSTRAINT "calls_messages_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "calls_messages_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
