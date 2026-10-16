import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export const SCHEDULED_MEETING_CONFLICT =
  "This lead already has a scheduled meeting. Complete or cancel it before scheduling another.";
export const SCHEDULED_MEETING_UNIQUE_INDEX =
  "meetings_one_scheduled_per_lead_idx";

export async function assertNoScheduledMeeting(
  tx: Prisma.TransactionClient,
  leadId: string,
) {
  const scheduledMeeting = await tx.meeting.findFirst({
    where: { leadId, status: "SCHEDULED" },
    select: { id: true },
  });
  if (scheduledMeeting) {
    throw new BadRequestException(SCHEDULED_MEETING_CONFLICT);
  }
}
