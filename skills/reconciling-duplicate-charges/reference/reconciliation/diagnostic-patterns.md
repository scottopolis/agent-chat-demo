# Duplicate-charge diagnostic patterns

Apply this decision tree in order after interpreting payment states and corroborating them with subscription and fulfillment data. Stop at the first pattern whose required evidence is complete.

## 1. Legitimate subscription renewal

Required evidence:

- At least two captured payments are visible to the customer.
- One payment maps to the merchandise order.
- The other maps to a billable renewal with a subscription or invoice reference and timestamp.
- The renewal amount and payment timestamp match the subscription record.

Contradictions: no billed renewal in the comparison window, or both captures identify the same one-time order without a renewal reference.

Classification: `separate subscription charge` with high confidence.

## 2. Reversed attempt followed by retry

Required evidence:

- The first attempt is declined, reversed, or voided with captured amount $0.
- A later attempt for the same order, amount, and currency is captured.
- The attempts occur no more than 5 minutes apart.
- There is no matching subscription renewal.
- Commerce records show one order and one fulfillment.

Contradictions: the first attempt has a captured amount above $0, or the processor summary reports two captures.

Classification: `temporary authorization plus successful retry` with high confidence. If the first attempt is still issuer-visible, describe it as pending rather than refunded.

## 3. Currency-conversion representation

Required evidence:

- Exactly one processor capture exists.
- The customer-visible amounts are in different currencies.
- Both representations share one ARN.
- There is no matching subscription renewal.
- Commerce records show one order and one fulfillment.

Contradictions: two processor captures, two ARNs, or two same-currency amounts.

Classification: `single charge represented in two currencies` with high confidence.

## 4. Actual duplicate capture

Required evidence:

- Two distinct processor references are both captured.
- The captures share the same order, amount, and currency.
- The captures occur no more than 10 minutes apart.
- No subscription record explains either capture.
- One order and one fulfillment exist.

Contradictions: one attempt is reversed or captured for $0, or a billable renewal maps to the second capture.

Classification: `probable duplicate capture` with high confidence. Use “probable” because payment operations must approve remediation.

## 5. Inconclusive

Use this classification when no pattern has all required evidence, a contradiction exists, or any source record is missing. Confidence is low. Never blend parts of multiple patterns into a new diagnosis.
