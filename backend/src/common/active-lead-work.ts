import { BadRequestException } from "@nestjs/common";
import { FollowUpStatus, MeetingStatus, Prisma } from "@prisma/client";

export const ACTIVE_LEAD_WORK_CONFLICT =
  "This lead already has a pending task, call, or scheduled meeting. Complete or cancel it before creating another.";

type ActiveLeadWorkExclusions = {
  followUpId?: string;
  callMessageId?: string;
  meetingId?: string;
};

export async function lockLeadActiveWork(
  tx: Prisma.TransactionClient,
  leadId: string,
) {
  await tx.$queryRaw`
    WITH lead_work_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(
        721341::integer,
        hashtext(${leadId})::integer
      )
    )
    SELECT 1::integer AS locked FROM lead_work_lock
  `;
}

export async function assertLeadHasNoOtherActiveWork(
  tx: Prisma.TransactionClient,
  leadId: string,
  exclusions: ActiveLeadWorkExclusions = {},
) {
  await lockLeadActiveWork(tx, leadId);

  const [followUp, callMessage, meeting] = await Promise.all([
    tx.followUp.findFirst({
      where: {
        AND: [
          { leadId, status: FollowUpStatus.PENDING },
          ...(exclusions.followUpId
            ? [{ id: { not: exclusions.followUpId } }]
            : []),
          ...(exclusions.meetingId
            ? [
                {
                  OR: [
                    { meetingId: null },
                    { meetingId: { not: exclusions.meetingId } },
                  ],
                },
              ]
            : []),
        ],
      },
      select: { id: true },
    }),
    tx.callMessage.findFirst({
      where: {
        leadId,
        status: FollowUpStatus.PENDING,
        ...(exclusions.callMessageId
          ? { id: { not: exclusions.callMessageId } }
          : {}),
      },
      select: { id: true },
    }),
    tx.meeting.findFirst({
      where: {
        leadId,
        status: MeetingStatus.SCHEDULED,
        ...(exclusions.meetingId ? { id: { not: exclusions.meetingId } } : {}),
      },
      select: { id: true },
    }),
  ]);

  if (followUp || callMessage || meeting) {
    throw new BadRequestException(ACTIVE_LEAD_WORK_CONFLICT);
  }
}
