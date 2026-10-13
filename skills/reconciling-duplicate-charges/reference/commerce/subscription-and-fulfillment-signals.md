# Subscription and fulfillment signals

Payment records establish funds movement. Subscription and shipping records establish the likely business purpose of those movements.

## Subscription interpretation

Check the 7 days before and after the reported order payment.

- A billable renewal with its own subscription or invoice reference can explain a second capture even when the acquisition order appears in payment metadata.
- A free membership, trial, or subscription without a payment method is not a second billable event.
- An active subscription without a renewal in the comparison window does not explain a second charge.
- A canceled subscription may still have a final invoice. Require an actual billed renewal record; do not infer one from status alone.
- Matching amount alone is weak evidence. Require a renewal timestamp and billable reference before classifying the second payment as legitimate recurring billing.

## Fulfillment interpretation

- One order plus one fulfillment supports either a retry, currency representation, subscription renewal, or an accidental duplicate capture.
- Two captures plus two independent orders and two fulfillments may be two purchases, not a payment duplicate. Do not use the duplicate-capture playbook unless the customer confirms one order was unintended.
- Two captures attached to one order plus one fulfillment strongly supports an accidental duplicate capture.
- One capture plus two fulfillment records is a fulfillment defect, not a duplicate-charge diagnosis. Escalate to order operations.
- A fulfillment created shortly after the successful retry helps identify which attempt completed checkout, but fulfillment timing does not change payment state.

## Contradiction handling

Do not force a diagnosis when systems disagree. Examples:

- Payment reports two captures while its summary claims one settled charge.
- Subscription reports a billed renewal but provides no timestamp or billing reference.
- Shipping reports two fulfillments under one fulfillment ID.
- A payment or fulfillment references a different OCPP order number from the requested order.

Quote the conflicting records and classify the reconciliation as inconclusive.
