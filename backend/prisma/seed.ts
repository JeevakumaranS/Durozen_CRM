import {
  LeadPriority,
  LeadStage,
  MeetingStatus,
  Prisma,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "DemoPass123!";

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

async function seed(tx: Prisma.TransactionClient) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const manager = await tx.user.upsert({
    where: { email: "manager@durozen.com" },
    update: { fullName: "Taylor Morgan", role: UserRole.SALES_MANAGER },
    create: {
      fullName: "Taylor Morgan",
      email: "manager@durozen.com",
      passwordHash,
      role: UserRole.SALES_MANAGER,
    },
  });
  const bdeOne = await tx.user.upsert({
    where: { email: "bde@durozen.com" },
    update: {
      fullName: "Alex Sales",
      role: UserRole.BDE,
      managerId: manager.id,
    },
    create: {
      fullName: "Alex Sales",
      email: "bde@durozen.com",
      passwordHash,
      role: UserRole.BDE,
      managerId: manager.id,
    },
  });
  const bdeTwo = await tx.user.upsert({
    where: { email: "bde2@durozen.com" },
    update: {
      fullName: "Morgan Chen",
      role: UserRole.BDE,
      managerId: manager.id,
    },
    create: {
      fullName: "Morgan Chen",
      email: "bde2@durozen.com",
      passwordHash,
      role: UserRole.BDE,
      managerId: manager.id,
    },
  });

  const leadSeeds = [
    {
      leadNumber: "DZN-2026-DEMO-001",
      customerName: "Priya Sharma",
      businessName: "Northstar Foods",
      businessCategory: "Food & Beverage",
      mobileNumber: "+919876540101",
      email: "priya@northstar.example",
      location: "Bengaluru",
      requirement: "CRM implementation for a 20-person sales team",
      estimatedBudget: 450000,
      leadSource: "Website",
      priority: LeadPriority.HOT,
      assignedBdeId: bdeOne.id,
      stage: LeadStage.NEW_LEAD,
      nextAction: "Call to confirm the sales workflow",
      followUpAt: daysFromNow(1),
    },
    {
      leadNumber: "DZN-2026-DEMO-002",
      customerName: "Rahul Mehta",
      businessName: "Mehta Industrial Supply",
      businessCategory: "Manufacturing",
      mobileNumber: "+919876540102",
      email: "rahul@mehtaindustrial.example",
      location: "Pune",
      requirement: "Lead tracking and sales reporting",
      estimatedBudget: 275000,
      leadSource: "Referral",
      priority: LeadPriority.WARM,
      assignedBdeId: bdeOne.id,
      stage: LeadStage.MEETING,
      nextAction: "Share discovery meeting notes",
      followUpAt: daysFromNow(2),
    },
    {
      leadNumber: "DZN-2026-DEMO-003",
      customerName: "Ananya Rao",
      businessName: "Cedarline Realty",
      businessCategory: "Real Estate",
      mobileNumber: "+919876540103",
      email: "ananya@cedarline.example",
      location: "Hyderabad",
      requirement: "Automate inbound lead assignment",
      estimatedBudget: 380000,
      leadSource: "LinkedIn",
      priority: LeadPriority.HOT,
      assignedBdeId: bdeOne.id,
      stage: LeadStage.PROPOSAL,
      nextAction: "Review the submitted proposal",
      followUpAt: daysFromNow(3),
    },
    {
      leadNumber: "DZN-2026-DEMO-004",
      customerName: "Vikram Iyer",
      businessName: "BluePeak Logistics",
      businessCategory: "Logistics",
      mobileNumber: "+919876540104",
      email: "vikram@bluepeak.example",
      location: "Chennai",
      requirement: "Sales pipeline and customer follow-up system",
      estimatedBudget: 520000,
      leadSource: "Trade Show",
      priority: LeadPriority.WARM,
      assignedBdeId: bdeTwo.id,
      stage: LeadStage.NEGOTIATION,
      nextAction: "Confirm revised commercial terms",
      followUpAt: daysFromNow(2),
    },
    {
      leadNumber: "DZN-2026-DEMO-005",
      customerName: "Neha Kapoor",
      businessName: "Evergreen Health",
      businessCategory: "Healthcare",
      mobileNumber: "+919876540105",
      email: "neha@evergreenhealth.example",
      location: "Mumbai",
      requirement: "CRM rollout for clinic partnerships",
      estimatedBudget: 300000,
      leadSource: "Partner",
      priority: LeadPriority.WARM,
      assignedBdeId: bdeTwo.id,
      stage: LeadStage.WON,
      nextAction: "Prepare onboarding handoff",
      followUpAt: daysFromNow(5),
      finalDealValue: 285000,
      wonService: "CRM implementation",
      paymentStatus: "PENDING",
      expectedStartDate: daysFromNow(14),
      wonRemarks: "Scope and delivery plan approved.",
    },
    {
      leadNumber: "DZN-2026-DEMO-006",
      customerName: "Arjun Nair",
      businessName: "Riverstone Learning",
      businessCategory: "Education",
      mobileNumber: "+919876540106",
      email: "arjun@riverstonelearning.example",
      location: "Kochi",
      requirement: "Track institutional sales opportunities",
      estimatedBudget: 150000,
      leadSource: "Webinar",
      priority: LeadPriority.COLD,
      assignedBdeId: bdeTwo.id,
      stage: LeadStage.LOST,
      nextAction: "Record learnings for future outreach",
      followUpAt: daysFromNow(30),
      lostReason: "Project deferred until next financial year.",
    },
  ];

  const leads = new Map<string, { id: string }>();
  for (const lead of leadSeeds) {
    const savedLead = await tx.lead.upsert({
      where: { leadNumber: lead.leadNumber },
      update: lead,
      create: lead,
      select: { id: true },
    });
    leads.set(lead.leadNumber, savedLead);
  }

  const meetingLead = leads.get("DZN-2026-DEMO-002")!;
  const proposalLead = leads.get("DZN-2026-DEMO-003")!;
  const negotiationLead = leads.get("DZN-2026-DEMO-004")!;
  const meeting = await tx.meeting.upsert({
    where: { id: "0199f000-0001-7000-8000-000000000001" },
    update: {},
    create: {
      id: "0199f000-0001-7000-8000-000000000001",
      leadId: meetingLead.id,
      meetingAt: daysFromNow(-1),
      status: MeetingStatus.COMPLETED,
      completedAt: daysFromNow(-1),
      type: "Discovery",
      requirement: "Lead tracking and sales reporting",
      budget: 275000,
      discussionNotes:
        "Reviewed the current sales handoff and reporting process.",
      nextAction: "Share discovery meeting notes",
      followUpAt: daysFromNow(2),
    },
  });

  const proposalData = {
    serviceProduct: "CRM implementation and sales reporting",
    proposalAmount: 380000,
    discount: 20000,
    tax: 64800,
    finalAmount: 424800,
    followUpAt: daysFromNow(3),
    remarks: "Includes setup, training, and reporting dashboards.",
  };
  const existingProposal = await tx.proposal.findFirst({
    where: { leadId: proposalLead.id },
    select: { id: true },
  });
  if (existingProposal) {
    await tx.proposal.update({
      where: { id: existingProposal.id },
      data: proposalData,
    });
  } else {
    await tx.proposal.create({
      data: { leadId: proposalLead.id, ...proposalData },
    });
  }

  await tx.negotiation.upsert({
    where: { id: "0199f000-0002-7000-8000-000000000001" },
    update: {},
    create: {
      id: "0199f000-0002-7000-8000-000000000001",
      leadId: negotiationLead.id,
      originalProposalAmount: 520000,
      customerExpectedAmount: 480000,
      negotiatedAmount: 495000,
      customerConcern: "Phased payment terms",
      nextAction: "Confirm revised commercial terms",
      followUpAt: daysFromNow(2),
      remarks: "Customer is aligned on scope pending payment schedule.",
    },
  });

  const activitySeeds = [
    {
      id: "0199f000-0003-7000-8000-000000000001",
      leadId: leads.get("DZN-2026-DEMO-001")!.id,
      userId: bdeOne.id,
      type: "CALL",
      description:
        "Initial call completed; customer shared team size and goals.",
      outcome: "Qualified lead",
      nextAction: "Call to confirm the sales workflow",
    },
    {
      id: "0199f000-0003-7000-8000-000000000002",
      leadId: meetingLead.id,
      meetingId: meeting.id,
      userId: bdeOne.id,
      type: "MEETING",
      description: "Discovery meeting held with the sales operations team.",
      outcome: "Reporting needs confirmed",
      nextAction: "Share discovery meeting notes",
    },
    {
      id: "0199f000-0003-7000-8000-000000000003",
      leadId: proposalLead.id,
      userId: bdeOne.id,
      type: "EMAIL",
      description: "Proposal sent with implementation scope and pricing.",
      outcome: "Awaiting customer review",
      nextAction: "Review the submitted proposal",
    },
  ];
  for (const activity of activitySeeds) {
    await tx.activity.upsert({
      where: { id: activity.id },
      update: {},
      create: activity,
    });
  }

  const followUpSeeds = [
    {
      id: "0199f000-0004-7000-8000-000000000001",
      leadId: leads.get("DZN-2026-DEMO-001")!.id,
      dueAt: daysFromNow(1),
      type: "CALL",
      nextAction: "Call to confirm the sales workflow",
      remarks: "Ask about current lead assignment and reporting.",
    },
    {
      id: "0199f000-0004-7000-8000-000000000002",
      leadId: meetingLead.id,
      meetingId: meeting.id,
      dueAt: daysFromNow(2),
      type: "MEETING_NOTES",
      nextAction: "Share discovery meeting notes",
      remarks: "Send a summary of the agreed reporting requirements.",
    },
    {
      id: "0199f000-0004-7000-8000-000000000003",
      leadId: proposalLead.id,
      dueAt: daysFromNow(3),
      type: "PROPOSAL_REVIEW",
      nextAction: "Review the submitted proposal",
      remarks: "Confirm scope, timeline, and commercial terms.",
    },
    {
      id: "0199f000-0004-7000-8000-000000000004",
      leadId: negotiationLead.id,
      dueAt: daysFromNow(2),
      type: "NEGOTIATION",
      nextAction: "Confirm revised commercial terms",
      remarks: "Follow up on the phased payment schedule.",
    },
  ];
  for (const followUp of followUpSeeds) {
    await tx.followUp.upsert({
      where: { id: followUp.id },
      update: {},
      create: followUp,
    });
  }
}

async function main() {
  const reset = process.argv.includes("--reset");
  await prisma.$transaction(
    async (tx) => {
      if (reset) {
        await tx.$executeRawUnsafe(
          'TRUNCATE TABLE "activities", "follow_ups", "proposals", "meetings", "negotiations", "leads", "users" RESTART IDENTITY CASCADE',
        );
      }
      await seed(tx);
    },
    { timeout: 30000 },
  );
  console.log(
    reset ? "Application data reset and reseeded." : "Sample data seeded.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
