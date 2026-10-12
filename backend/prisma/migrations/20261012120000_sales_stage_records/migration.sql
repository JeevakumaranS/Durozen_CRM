-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "proposal_number" TEXT NOT NULL,
    "proposal_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service_product" TEXT NOT NULL,
    "proposal_amount" DECIMAL(65,30) NOT NULL,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "final_amount" DECIMAL(65,30) NOT NULL,
    "validity_until" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "customer_response" TEXT,
    "follow_up_at" TIMESTAMP(3),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "meeting_at" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "participants" TEXT,
    "requirement" TEXT,
    "budget" DECIMAL(65,30),
    "discussion_notes" TEXT,
    "customer_concerns" TEXT,
    "next_action" TEXT NOT NULL,
    "follow_up_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiations" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "original_proposal_amount" DECIMAL(65,30),
    "customer_expected_amount" DECIMAL(65,30),
    "negotiated_amount" DECIMAL(65,30),
    "customer_concern" TEXT,
    "competitor_information" TEXT,
    "next_action" TEXT NOT NULL,
    "follow_up_at" TIMESTAMP(3) NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposals_proposal_number_key" ON "proposals"("proposal_number");

-- CreateIndex
CREATE INDEX "proposals_lead_id_proposal_date_idx" ON "proposals"("lead_id", "proposal_date");

-- CreateIndex
CREATE INDEX "meetings_meeting_at_idx" ON "meetings"("meeting_at");

-- CreateIndex
CREATE INDEX "meetings_lead_id_meeting_at_idx" ON "meetings"("lead_id", "meeting_at");

-- CreateIndex
CREATE INDEX "negotiations_lead_id_created_at_idx" ON "negotiations"("lead_id", "created_at");

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;