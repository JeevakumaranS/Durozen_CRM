ALTER TABLE "users"
ADD COLUMN "manager_id" TEXT;

ALTER TABLE "users"
ADD CONSTRAINT "users_manager_id_fkey"
FOREIGN KEY ("manager_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "users_manager_id_idx" ON "users"("manager_id");
