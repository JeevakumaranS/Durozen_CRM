import { businessDateKey } from "../../lib/business-time";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);

type ProposalCompletionFieldsProps = {
  leadName: string;
  serviceProduct: string;
  proposalAmount: string;
  discount: string;
  followUpDate: string;
  setServiceProduct: (value: string) => void;
  setProposalAmount: (value: string) => void;
  setDiscount: (value: string) => void;
  setFollowUpDate: (value: string) => void;
};

export function ProposalCompletionFields({
  leadName,
  serviceProduct,
  proposalAmount,
  discount,
  followUpDate,
  setServiceProduct,
  setProposalAmount,
  setDiscount,
  setFollowUpDate,
}: ProposalCompletionFieldsProps) {
  return (
    <>
      <label>
        Lead name
        <input disabled value={leadName} />
      </label>
      <label>
        Service / Product *
        <input
          required
          value={serviceProduct}
          onChange={(event) => setServiceProduct(event.target.value)}
        />
      </label>
      <label>
        Proposal Amount (₹) *
        <input
          required
          min="0"
          step="0.01"
          type="number"
          value={proposalAmount}
          onChange={(event) => setProposalAmount(event.target.value)}
        />
      </label>
      <label>
        Discount (₹)
        <input
          min="0"
          step="0.01"
          type="number"
          value={discount}
          onChange={(event) => setDiscount(event.target.value)}
        />
      </label>
      <label>
        Final Amount (₹)
        <input
          disabled
          value={
            proposalAmount
              ? formatCurrency(
                  Math.max(
                    Number(proposalAmount) - Number(discount || 0),
                    0,
                  ),
                )
              : ""
          }
        />
      </label>
      <label className="form-wide">
        Follow-up date *
        <input
          required
          type="date"
          min={businessDateKey(new Date())}
          value={followUpDate}
          onChange={(event) => setFollowUpDate(event.target.value)}
        />
      </label>
    </>
  );
}
