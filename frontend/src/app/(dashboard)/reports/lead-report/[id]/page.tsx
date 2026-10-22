import { LeadDetail } from "../../../../../features/leads/lead-detail";

export default function LeadActivityReportPage() {
  return (
    <LeadDetail
      backHref="/reports/lead-report"
      backLabel="Lead Report"
      showActivityExport
    />
  );
}
