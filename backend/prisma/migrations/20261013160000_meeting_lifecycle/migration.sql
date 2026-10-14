CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "meetings"
ADD COLUMN "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN "completed_at" TIMESTAMP(3);

ALTER TABLE "activities"
ADD COLUMN "meeting_id" TEXT;

ALTER TABLE "follow_ups"
ADD COLUMN "meeting_id" TEXT;

ALTER TABLE "activities"
ADD CONSTRAINT "activities_meeting_id_fkey"
FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "follow_ups"
ADD CONSTRAINT "follow_ups_meeting_id_fkey"
FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "activities_meeting_id_created_at_idx"
ON "activities"("meeting_id", "created_at");

CREATE INDEX "follow_ups_meeting_id_status_idx"
ON "follow_ups"("meeting_id", "status");
