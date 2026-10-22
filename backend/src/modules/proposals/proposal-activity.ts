type ProposalActivityDetails = {
  leadNumber: string;
  serviceProduct: string;
  proposalDate: Date;
  proposalAmount: string | number;
  discount: string | number;
  tax: string | number;
  finalAmount: string | number;
  followUpAt: Date;
  nextAction: string;
  customerResponse?: string | null;
  remarks?: string | null;
};

const amount = (value: string | number) =>
  `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function proposalActivityDescription(
  details: ProposalActivityDetails,
) {
  return [
    `Proposal ${details.leadNumber} prepared for ${details.serviceProduct}`,
    `Proposal date: ${details.proposalDate.toISOString().slice(0, 10)}`,
    `Proposal amount: ${amount(details.proposalAmount)}`,
    `Discount: ${amount(details.discount)}`,
    `Tax: ${amount(details.tax)}`,
    `Final amount: ${amount(details.finalAmount)}`,
    details.customerResponse?.trim()
      ? `Customer response: ${details.customerResponse.trim()}`
      : "",
    `Next action: ${details.nextAction}`,
    `Follow-up: ${details.followUpAt.toISOString()}`,
    details.remarks?.trim() ? `Remarks: ${details.remarks.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
