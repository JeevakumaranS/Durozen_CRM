UPDATE "follow_ups" AS follow_up
SET
  "type" = 'Negotiation',
  "negotiation_id" = (
    SELECT negotiation."id"
    FROM "negotiations" AS negotiation
    WHERE negotiation."lead_id" = follow_up."lead_id"
    ORDER BY negotiation."created_at" DESC
    LIMIT 1
  ),
  "next_action" = CASE
    WHEN follow_up."status" = 'PENDING' THEN 'Follow up on negotiation'
    ELSE follow_up."next_action"
  END
FROM "leads" AS lead
WHERE lead."id" = follow_up."lead_id"
  AND lead."stage" = 'NEGOTIATION'
  AND follow_up."type" = 'Proposal Follow-up';
