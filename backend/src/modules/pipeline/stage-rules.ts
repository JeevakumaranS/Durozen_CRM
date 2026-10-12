import { LeadStage } from "@prisma/client";

const ALLOWED_TRANSITIONS: Partial<Record<LeadStage, LeadStage[]>> = {
  NEW_LEAD: ["CONTACTED", "LOST"],
  CONTACTED: ["INTERESTED", "MEETING", "LOST"],
  INTERESTED: ["MEETING", "PROPOSAL", "LOST"],
  MEETING: ["PROPOSAL", "NEGOTIATION", "LOST"],
  PROPOSAL: ["NEGOTIATION", "WON", "LOST"],
  NEGOTIATION: ["WON", "LOST"],
};

export function canTransition(from: LeadStage, to: LeadStage): boolean {
  return from === to || ALLOWED_TRANSITIONS[from]?.includes(to) === true;
}
