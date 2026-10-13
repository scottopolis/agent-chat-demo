# Resolution and escalation

Match the response and next action to the selected diagnostic pattern.

## Customer response structure

1. **Classification:** one sentence naming the pattern and confidence.
2. **Evidence:** a compact table with rows for payments, subscription, and shipping. Include UTC timestamps and identifiers.
3. **Meaning:** explain why two entries do or do not represent two settled charges.
4. **Next action:** state what the customer should expect or what support must review.

Do not expose internal jargon without a short explanation. For example, define a reversal as “an authorization that was released before OC Power Pedals collected funds.”

## Pattern-specific action

### Temporary authorization plus retry

Explain that OC Power Pedals captured only the successful retry. State that the issuer may continue displaying the reversed authorization for up to 7 business days. If it remains after that window, direct the customer to their card issuer with the reversed processor reference. Do not say the pending entry is already gone.

### Single charge represented in two currencies

Explain the merchant amount, cardholder amount, and shared ARN. State that the issuer controls how converted amounts appear. Direct statement-format questions to the issuer. Do not describe either representation as a refund or second purchase.

### Probable duplicate capture

Say that two settled payment records appear to correspond to one fulfilled order. Escalate to payment operations; do not promise which capture will be refunded or when.

The escalation summary must contain:

- OCPP order number
- both processor references
- both capture timestamps, amounts, and currencies
- subscription finding and comparison window
- order count, fulfillment count, and fulfillment ID
- explicit note that no refund is currently recorded

### Separate subscription charge

Identify the one-time order and subscription renewal separately, including references and dates. If the customer disputes the renewal, route to subscription support rather than payment-duplicate review.

### Inconclusive

List the missing or contradictory evidence. Ask support to reconcile the named systems; do not offer the most likely diagnosis as fact.

## Prohibited promises

The agent cannot approve or initiate refunds, cancel subscriptions, release issuer authorizations, alter exchange rates, stop shipments, or confirm that another team has taken action. It may only describe tool-reported state and recommend the documented next action.
