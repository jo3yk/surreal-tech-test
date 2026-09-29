# Context

Domain terms for the booking ledger.

- **Booking**: an entertainer engaged by a venue for a gig at `startsAt`, for an agreed **fee**. Status is `booked` or `cancelled`.
- **Payment**: money a venue has paid against a booking, in cents. A booking can have many (deposit plus balance). Identified by a client-supplied `reference`, which doubles as its idempotency key.
- **Paid**: the sum of a booking's payments. An overpayment is shown as-is, never clamped.
- **Outstanding**: the fee still owed on a booking. Zero once paid in full, and always zero once the booking is cancelled.
- **Cancelled-booking payment**: a payment recorded against a cancelled booking (for example a deposit paid before cancellation). It is always recorded and still counts as paid; the fee is simply no longer owed. Returning the money is a separate future event (refund).
- **Earnings**: an entertainer's summary of paid and outstanding across all their bookings, with a per-booking breakdown. Served by the Earnings module (`src/earnings/`), which is its own read model built from booking, payment and entertainer events.
