---
name: reconciling-duplicate-charges
description: Reconciles duplicate-charge reports across payment, subscription, and shipping records. Use when a customer says they were charged twice or sees two similar card entries.
---

# Reconciling duplicate charges

Use this playbook whenever a customer reports two charges for the same OC Power Pedals purchase. This skill coordinates several systems; no single tool result is sufficient for a diagnosis.

## Required inputs

Ask for the OCPP order number if the customer has not provided it. The demo data recognizes `OCPP-10482`, `OCPP-10731`, and `OCPP-10904`.

## Knowledge map

- Read `reference/reconciliation/diagnostic-patterns.md` after all three tool calls return to choose a classification.
- Read `reference/payment-processing/lifecycle-and-identifiers.md` only when the payment records include a non-captured state, multiple currencies, a network reference, or an unclear transaction count.
- Read `reference/commerce/subscription-and-fulfillment-signals.md` only when a subscription has a potentially billable event, there is not exactly one order and one fulfillment, or the commerce records contradict the payment hypothesis.
- Read `reference/operations/resolution-and-escalation.md` only when the classification requires escalation or the result is inconclusive.

Do not read every reference file preemptively. The paths above are routing instructions, not a required reading list.

## Workflow

1. Call `getPaymentTransactions`, `getSubscriptionStatus`, and `getShippingHistory` with the same order number.
2. Normalize the returned timestamps to UTC. Preserve every processor, network, subscription, order, and fulfillment identifier exactly as returned.
3. Read the diagnostic pattern reference and apply its ordered decision tree. Do not select a pattern unless all required evidence is present and no contradiction signal is present.
4. Read only the additional reference files whose routing conditions match the returned records, then use them to confirm or reject the tentative classification.
5. If escalation guidance was needed, use it to construct the response and next action. Otherwise answer directly from the confirmed pattern and tool evidence.
6. If records are missing, tools disagree, or no pattern meets its evidence threshold, classify the result as **inconclusive** and escalate with the conflicting facts.

## Response format

State the classification and confidence first, then give a short evidence table with payment, subscription, and shipping findings. Include exact timestamps, amounts, and identifiers that support the conclusion. End with the approved next action.

Never claim a pending authorization has disappeared, a duplicate capture has been refunded, or a bank has corrected its statement unless a tool explicitly says so.
