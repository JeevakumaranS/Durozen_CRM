export const LEAD_UPDATED_EVENT = "durozen:lead-updated";

export function notifyLeadUpdated(leadId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(LEAD_UPDATED_EVENT, { detail: { leadId } }),
  );
}
