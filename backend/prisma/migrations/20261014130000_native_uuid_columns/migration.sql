BEGIN;

ALTER TABLE "activities" DROP CONSTRAINT "activities_lead_id_fkey";
ALTER TABLE "activities" DROP CONSTRAINT "activities_meeting_id_fkey";
ALTER TABLE "activities" DROP CONSTRAINT "activities_user_id_fkey";
ALTER TABLE "follow_ups" DROP CONSTRAINT "follow_ups_lead_id_fkey";
ALTER TABLE "follow_ups" DROP CONSTRAINT "follow_ups_meeting_id_fkey";
ALTER TABLE "leads" DROP CONSTRAINT "leads_assigned_bde_id_fkey";
ALTER TABLE "meetings" DROP CONSTRAINT "meetings_lead_id_fkey";
ALTER TABLE "negotiations" DROP CONSTRAINT "negotiations_lead_id_fkey";
ALTER TABLE "proposals" DROP CONSTRAINT "proposals_lead_id_fkey";
ALTER TABLE "users" DROP CONSTRAINT "users_manager_id_fkey";

ALTER TABLE "users"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "manager_id" TYPE UUID USING "manager_id"::uuid;
ALTER TABLE "leads"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "assigned_bde_id" TYPE UUID USING "assigned_bde_id"::uuid;
ALTER TABLE "activities"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "lead_id" TYPE UUID USING "lead_id"::uuid,
  ALTER COLUMN "meeting_id" TYPE UUID USING "meeting_id"::uuid,
  ALTER COLUMN "user_id" TYPE UUID USING "user_id"::uuid;
ALTER TABLE "follow_ups"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "lead_id" TYPE UUID USING "lead_id"::uuid,
  ALTER COLUMN "meeting_id" TYPE UUID USING "meeting_id"::uuid;
ALTER TABLE "proposals"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "lead_id" TYPE UUID USING "lead_id"::uuid;
ALTER TABLE "meetings"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "lead_id" TYPE UUID USING "lead_id"::uuid;
ALTER TABLE "negotiations"
  ALTER COLUMN "id" TYPE UUID USING "id"::uuid,
  ALTER COLUMN "lead_id" TYPE UUID USING "lead_id"::uuid;

ALTER TABLE "activities"
  ADD CONSTRAINT "activities_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "activities_meeting_id_fkey"
    FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "activities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "follow_ups"
  ADD CONSTRAINT "follow_ups_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "follow_ups_meeting_id_fkey"
    FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads"
  ADD CONSTRAINT "leads_assigned_bde_id_fkey"
    FOREIGN KEY ("assigned_bde_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meetings"
  ADD CONSTRAINT "meetings_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "negotiations"
  ADD CONSTRAINT "negotiations_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposals"
  ADD CONSTRAINT "proposals_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "users"
  ADD CONSTRAINT "users_manager_id_fkey"
    FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;