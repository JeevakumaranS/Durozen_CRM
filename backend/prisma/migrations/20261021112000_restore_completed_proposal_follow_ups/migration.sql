UPDATE "follow_ups"
SET
  "type" = 'Proposal Follow-up',
  "negotiation_id" = NULL
WHERE "type" = 'Negotiation'
  AND "status" = 'COMPLETED'
  AND "proposal_id" IS NOT NULL;
