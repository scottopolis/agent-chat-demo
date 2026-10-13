# Payment lifecycle and identifiers

Use these rules to interpret the payment processor report before comparing it with subscription and fulfillment data.

## Transaction states

| State | Funds movement | Treatment in reconciliation |
| --- | --- | --- |
| `AUTHORIZED` or pending authorization | Issuer reserved funds; merchant has not captured them | Not a settled charge. It may still appear in the customer's available balance. |
| `REVERSED` or `VOIDED` | Authorization was released before capture | Captured amount must be $0. Do not count it as a second settled charge. |
| `DECLINED` | Issuer rejected the attempt | No merchant funds movement. A later success is a retry, not automatically a duplicate. |
| `CAPTURED` | Merchant requested funds | Count as a charge. Two captures require further reconciliation even if settlement is pending. |
| `SETTLED` | Card network completed funds movement | Strongest evidence of a posted charge. |
| `REFUNDED` | Merchant initiated return of captured funds | Report the refund only if its amount and processor reference are present. |

Authorization and capture records with different processor references are separate attempts. They are not separate settled charges unless both reached `CAPTURED`.

## Identifiers

- **Processor reference (`pay_…`)** identifies one payment attempt. Cite both references when two captures exist.
- **Order number (`OCPP-…`)** links payments to the commerce order, but does not prove they belong to the same business purpose; a renewal may preserve the original acquisition order as metadata.
- **Card-network reference (`ARN-…`)** identifies movement through the card network. Two currency displays sharing one ARN are representations of one charge unless the report shows multiple captures.
- **Fulfillment ID (`ful_…`)** identifies goods released downstream. It corroborates order count but cannot negate a confirmed processor capture.

## Timing rules

- Treat a second attempt within 5 minutes of a declined, voided, or reversed attempt for the same amount as an automatic checkout retry candidate.
- Treat two captures within 10 minutes for the same order, amount, and currency as a duplicate-capture candidate.
- Do not infer sequence from calendar date alone. Compare full UTC timestamps.
- Settlement dates can differ from capture dates by one or more business days and are not evidence of a second transaction.
- A pending authorization may remain issuer-visible for up to 7 business days after reversal. This is a display window, not a guaranteed release deadline.

## Currency representation

The merchant presentment amount and cardholder billing amount can differ when the issuer converts currency. They describe one charge when all of the following are true:

1. Exactly one processor capture exists.
2. The two amounts use different currencies.
3. Both amounts map to the same ARN.
4. Subscription and fulfillment systems show no second billable event.

Different currencies without a shared ARN are insufficient evidence; classify that result as inconclusive.
