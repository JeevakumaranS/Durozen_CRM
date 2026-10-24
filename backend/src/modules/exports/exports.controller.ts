import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ReportsService } from "../reports/reports.service";
import { LeadsService } from "../leads/leads.service";
import { ExcelExportService } from "./excel.service";
import { PdfExportService } from "./pdf.service";
import { proposalActivityDescriptionForDisplay } from "../proposals/proposal-activity";

@Controller("exports")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class ExportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly leads: LeadsService,
    private readonly excel: ExcelExportService,
    private readonly pdf: PdfExportService,
  ) {}

  @Get(":type")
  async export(
    @Param("type") type: string,
    @Query("format") format: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("assignedBdeId") assignedBdeId: string | undefined,
    @Query("stage") stage: string | undefined,
    @Query("status") status: string | undefined,
    @Query("category") category: string | undefined,
    @Query("lostReason") lostReason: string | undefined,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    const rows = await this.reports.run(type, from, to, user, {
      assignedBdeId,
      stage,
      status,
      category,
      lostReason,
    });
    const title = this.reportTitle(type);
    const selectedBde = assignedBdeId
      ? (await this.reports.bdeOptions(user)).find(
          (bde) => bde.id === assignedBdeId,
        )
      : undefined;
    const dateBasis: Record<string, string> = {
      leads: "lead creation date",
      pipeline: "lead creation date",
      "lead-aging": "lead creation date",
      "follow-ups": "follow-up due date",
      proposals: "proposal date",
      "won-lost": "outcome date",
      revenue: "won date",
      "lost-leads": "lost date",
      "bde-performance": "each metric's recorded date",
      "monthly-summary": "each metric's recorded date",
    };
    const details = [
      from || to
        ? `Date range (${dateBasis[type] ?? "record date"}): ${from ?? "Any"} to ${to ?? "Today"}`
        : "",
      assignedBdeId
        ? `Assigned BDE: ${selectedBde?.fullName ?? assignedBdeId}`
        : "",
      stage ? `Stage: ${stage}` : "",
      status ? `Status: ${status}` : "",
      category ? `Follow-up category: ${category}` : "",
      lostReason ? `Lost reason contains: ${lostReason}` : "",
    ].filter(Boolean);
    if (format === "pdf") {
      const data = await this.pdf.create(rows, type, title, details);
      return new StreamableFile(data, {
        type: "application/pdf",
        disposition: `attachment; filename="${type}.pdf"`,
      });
    }
    if (format === "xlsx") {
      const data = await this.excel.create(rows, type, title, details);
      return new StreamableFile(data, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disposition: `attachment; filename="${type}.xlsx"`,
      });
    }
    throw new BadRequestException("Format must be pdf or xlsx");
  }

  @Get("lead-activities/:id")
  @Roles("ADMIN", "BDE", "SALES_MANAGER")
  async exportLeadActivities(
    @Param("id") id: string,
    @Query("format") format: string,
    @CurrentUser() user: { sub: string; role: string },
  ) {
    if (format !== "pdf" && format !== "xlsx") {
      throw new BadRequestException("Format must be pdf or xlsx");
    }
    const lead = await this.leads.get(id, user);
    const formatDate = (value: Date | null | undefined) =>
      value
        ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(value)
        : "";
    const leadInformation = [
      { label: "Lead number", value: lead.leadNumber },
      { label: "Customer", value: lead.customerName },
      { label: "Business", value: lead.businessName ?? "" },
      { label: "Business category", value: lead.businessCategory ?? "" },
      { label: "Mobile", value: lead.mobileNumber },
      { label: "Email", value: lead.email ?? "" },
      { label: "Location", value: lead.location ?? "" },
      { label: "Lead date", value: formatDate(lead.leadDate) },
      { label: "Stage", value: lead.stage.replaceAll("_", " ") },
      { label: "Lead source", value: lead.leadSource },
      { label: "Priority", value: lead.priority },
      { label: "Assigned BDE", value: lead.assignedBde.fullName },
      { label: "Requirement", value: lead.requirement ?? "" },
      {
        label: "Estimated budget",
        value: lead.estimatedBudget?.toString() ?? "",
      },
      { label: "Final deal value", value: lead.finalDealValue?.toString() ?? "" },
      { label: "Payment status", value: lead.paymentStatus ?? "" },
      { label: "Advance amount", value: lead.advanceAmount?.toString() ?? "" },
      { label: "Paid amount", value: lead.paidAmount?.toString() ?? "" },
      { label: "Confirmed date", value: formatDate(lead.confirmedAt) },
      {
        label: "Expected start date",
        value: formatDate(lead.expectedStartDate),
      },
      { label: "Won service", value: lead.wonService ?? "" },
      { label: "Lost reason", value: lead.lostReason ?? "" },
      { label: "Won remarks", value: lead.wonRemarks ?? "" },
      { label: "Next action", value: lead.nextAction ?? "" },
      { label: "Next follow-up", value: formatDate(lead.followUpAt) },
      { label: "Remarks", value: lead.remarks ?? "" },
    ].filter(({ value }) => value !== "");
    const activities = [...lead.activities]
      .sort(
        (first, second) =>
          new Date(first.createdAt).getTime() -
          new Date(second.createdAt).getTime(),
      )
      .map((activity) => ({
        type: activity.type,
        createdAt: activity.createdAt,
        details: [
          { label: "Contact date", value: formatDate(activity.contactDate) },
          { label: "Contact type", value: activity.contactType ?? "" },
          {
            label: "Description",
            value:
              activity.type === "PROPOSAL_SENT"
                ? proposalActivityDescriptionForDisplay(
                    activity.description,
                    Boolean(activity.nextAction),
                    Boolean(activity.followUpAt),
                  )
                : activity.description,
          },
          { label: "Outcome", value: activity.outcome ?? "" },
          { label: "Customer response", value: activity.customerResponse ?? "" },
          { label: "Expected timeline", value: activity.expectedTimeline ?? "" },
          { label: "Requirement", value: activity.requirement ?? "" },
          {
            label: "Estimated budget",
            value: activity.estimatedBudget?.toString() ?? "",
          },
          {
            label: "Payment received",
            value: activity.paymentAmount?.toString() ?? "",
          },
          { label: "Payment status", value: activity.paymentStatus ?? "" },
          {
            label: "Total paid",
            value: activity.paymentTotal?.toString() ?? "",
          },
          {
            label: "Remaining balance",
            value: activity.paymentBalance?.toString() ?? "",
          },
          { label: "Next action", value: activity.nextAction ?? "" },
          { label: "Follow-up date", value: formatDate(activity.followUpAt) },
          { label: "Remarks", value: activity.remarks ?? "" },
          {
            label: "Recorded by",
            value: activity.user?.fullName ?? lead.assignedBde.fullName,
          },
        ].filter(({ value }) => value !== ""),
      }));
    const title = `Activity Timeline - ${lead.customerName}`;
    const filename = `${lead.leadNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}-activity`;
    if (format === "pdf") {
      const data = await this.pdf.createLeadActivityTimeline(
        title,
        leadInformation,
        activities,
      );
      return new StreamableFile(data, {
        type: "application/pdf",
        disposition: `attachment; filename="${filename}.pdf"`,
      });
    }
    const data = await this.excel.createLeadActivityTimeline(
      title,
      leadInformation,
      activities,
    );
    return new StreamableFile(data, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="${filename}.xlsx"`,
    });
  }

  private reportTitle(type: string) {
    const titles: Record<string, string> = {
      leads: "Lead Report",
      "bde-performance": "BDE Performance Report",
      pipeline: "Pipeline Report",
      "follow-ups": "Follow-up Report",
      proposals: "Proposal Report",
      "won-lost": "Won/Lost Report",
      revenue: "Revenue Report",
      "lost-leads": "Lost Lead Report",
      "monthly-summary": "Sales Performance Report",
    };
    return titles[type] ?? `${type.replaceAll("-", " ")} report`;
  }
}
