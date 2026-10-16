import { LeadStage } from "@prisma/client";

const ACTIVE_STAGES: readonly LeadStage[] = [
  "NEW_LEAD",
  "CONTACTED",
  "INTERESTED",
  "MEETING",
  "PROPOSAL",
  "NEGOTIATION",
];

const ALLOWED_TRANSITIONS: Partial<Record<LeadStage, LeadStage[]>> = {
  NEW_LEAD: ["CONTACTED", "INTERESTED", "MEETING", "LOST"],
  CONTACTED: ["INTERESTED", "MEETING", "LOST"],
  INTERESTED: ["MEETING", "PROPOSAL", "LOST"],
  MEETING: ["PROPOSAL", "NEGOTIATION", "LOST"],
  PROPOSAL: ["NEGOTIATION", "WON", "LOST"],
  NEGOTIATION: ["WON", "LOST"],
};

export function canTransition(from: LeadStage, to: LeadStage): boolean {
  const backwardWithinActiveStages =
    ACTIVE_STAGES.includes(from) &&
    ACTIVE_STAGES.includes(to) &&
    ACTIVE_STAGES.indexOf(to) < ACTIVE_STAGES.indexOf(from);

  return (
    from === to ||
    ALLOWED_TRANSITIONS[from]?.includes(to) === true ||
    backwardWithinActiveStages
  );
}
