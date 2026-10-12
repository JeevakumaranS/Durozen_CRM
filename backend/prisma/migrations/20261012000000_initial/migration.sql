-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SALES_MANAGER', 'BDE');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW_LEAD', 'CONTACTED', 'INTERESTED', 'MEETING', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'RESCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'BDE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "lead_number" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "business_name" TEXT,
    "business_category" TEXT,
    "mobile_number" TEXT NOT NULL,
    "email" TEXT,
    "location" TEXT,
    "requirement" TEXT,
    "estimated_budget" DECIMAL(65,30),
    "lead_source" TEXT NOT NULL,
    "priority" "LeadPriority" NOT NULL DEFAULT 'WARM',
    "assigned_bde_id" TEXT NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW_LEAD',
    "next_action" TEXT,
    "follow_up_at" TIMESTAMP(3),
    "final_deal_value" DECIMAL(65,30),
    "lost_reason" TEXT,
    "stage_entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "outcome" TEXT,
    "next_action" TEXT,
    "previous_stage" "LeadStage",
    "new_stage" "LeadStage",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "next_action" TEXT NOT NULL,
    "remarks" TEXT,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "leads_lead_number_key" ON "leads"("lead_number");

-- CreateIndex
CREATE INDEX "leads_stage_idx" ON "leads"("stage");

-- CreateIndex
CREATE INDEX "leads_follow_up_at_idx" ON "leads"("follow_up_at");

-- CreateIndex
CREATE INDEX "activities_lead_id_created_at_idx" ON "activities"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "follow_ups_status_due_at_idx" ON "follow_ups"("status", "due_at");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_bde_id_fkey" FOREIGN KEY ("assigned_bde_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;