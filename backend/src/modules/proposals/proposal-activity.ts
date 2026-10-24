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
    details.remarks?.trim() ? `Remarks: ${details.remarks.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function proposalActivityDescriptionForDisplay(
  description: string,
  hasNextAction: boolean,
  hasFollowUpAt: boolean,
) {
  return description
    .split(/\r?\n/)
    .filter((line) => {
      const trimmedLine = line.trim();
      if (/^next action:\s*/i.test(trimmedLine) && hasNextAction) {
        return false;
      }
      return !(
        /^follow-up:\s*/i.test(trimmedLine) &&
        hasFollowUpAt
      );
    })
    .join("\n");
}
