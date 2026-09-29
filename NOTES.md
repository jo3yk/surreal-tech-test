# Notes

# Part 0 - initial improvements

On first review, I noticed that the venueId and entertainerId referenced in a Booking aren't backed by anything in the data model - there's nothing to stop the caller creating bookings against completely unknown venues/entertainers.

The POST Booking request also looked a little iffy, with the type being BookingConfirmedEvent (containing a bookingId field which should not be supplied by the caller).

Added a Bruno collection to aid testing.

# Part 1

Added `PAYMENT_RECORDED_EVENT`, `POST /bookings/:id/payments`, a payment read model and `GET /entertainers/:id/earnings` (per-booking fee vs paid vs outstanding, plus totals).

Re: **the wrinkle** - payments are always recorded regardless of booking status. A payment is a fact about money that has already moved, so refusing it would make the ledger disagree with the bank. A cancelled booking keeps its `paidCents` (counted in `totalPaidCents`) and has `outstandingCents = 0`, since the fee is no longer owed. Refunds are future work and should be their own event.

Caveats:
- Included a field `reference` as the client's idempotency key. A retry with the same booking, amount and instant returns 200 with the original `paymentId`; the same reference with different details returns 409. However, if two concurrent requests come in with the same reference, we could still log duplicates without a uniqueness constraint in the event base.
- Overpayments are not handled. `paidCents` may exceed a booking's `feeCents`. `outstandingCents` is floored at 0.

