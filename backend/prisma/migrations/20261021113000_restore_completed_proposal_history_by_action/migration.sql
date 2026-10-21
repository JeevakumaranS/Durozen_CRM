UPDATE "follow_ups"
SET
  "type" = 'Proposal Follow-up',
  "negotiation_id" = NULL
WHERE "type" = 'Negotiation'
  AND "status" = 'COMPLETED'
  AND "next_action" = 'Follow up on proposal';
