UPDATE "leads"
SET "payment_status" = CASE
    WHEN "paid_amount" >= "final_deal_value" AND "final_deal_value" > 0
        THEN 'Fully Paid'
    WHEN "paid_amount" > 0
        AND "payment_status" IN ('Partially Paid', 'Partial Payment')
        THEN 'Partial Payment'
    WHEN "paid_amount" > 0
        THEN 'Advance Payment'
    ELSE 'Not Paid'
END
WHERE "stage" = 'WON';
