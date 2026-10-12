import { apiClient } from "../../lib/api-client";
import type { Lead, LeadStage } from "./leads.types";

export function getLeads(stage?: LeadStage): Promise<Lead[]> {
  const query = stage ? `?stage=${encodeURIComponent(stage)}` : "";
  return apiClient<Lead[]>(`/leads${query}`);
}
