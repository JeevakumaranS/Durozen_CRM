export type LeadStage =
  | "NEW_LEAD"
  | "CONTACTED"
  | "INTERESTED"
  | "MEETING"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "WON"
  | "LOST";

export type Lead = {
  id: string;
  leadNumber: string;
  customerName: string;
  businessName?: string | null;
  mobileNumber: string;
  stage: LeadStage;
};
