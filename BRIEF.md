# The brief

This repo is a very contrived implementation of our production codebase. The ShimmieStack framework is real and we use it in production. This is to test your fundamental understanding of event sourcing and CQRS.

Timebox is 2-3 hours, including write-up. We don’t want you spending your entire weekend on this. If you run out of time, just send what you've got and add a note on what you'd do next.

Use whatever you normally use (Claude, Copilot, Cursor, whatever). We will evaluate whether you understand what you submit on a follow-up call where you walk us through and extend your solution.

## Part 1: extend the service

Entertainers get paid for gigs, and the ledger doesn’t know about money yet.

Add payment recording to the service:

1. Add a new event, `PAYMENT_RECORDED_EVENT`, representing a payment made against a booking: at minimum, the booking, an amount in cents, and when it was paid. Partial payments are allowed (a venue might pay a deposit up front and the balance after the booking), so one booking can have many payments.
2. A command endpoint to record a payment against a booking.
3. A new read model + query endpoint for entertainer earnings summary. For a given entertainer, return at least: total paid across all gigs, and a per-booking breakdown of fee vs amount paid so far.
4. **The wrinkle:** a payment can arrive for a booking that has been cancelled (e.g., deposits paid before a cancellation). Decide how your model and API handle that, implement it, and leave a short comment explaining the choice.
5. Tests for the above, in the style of the existing suite.

Keep the existing code’s patterns unless you think one is wrong, in which case change it and say why in a comment or your note.

## Part 2: the design note

This service runs on ShimmieStack, and so does our production platform. Write us at most one page (dot points are fine) answering:

> At 10× and then 100× our current event volume, what in this architecture breaks first, and what would you change or replace?

Ground your answer in the actual framework (source: [ShimmieStack](https://github.com/simon-o-matic/ShimmieStack)). Assume production runs the Postgres event base with the same replay-on-startup model you see here.

## Submitting

Send either a link to a repo or a zip of the project (minus `node_modules`), including your design note as `DESIGN_NOTE.md` in the repo root to [steph@surreal.live](mailto:steph@surreal.live) (or reply to the email you got this from). Include a line or two on roughly how long you spent and anything you’d flag.

## What happens next

A 60-75-minute video call where you walk us through your solution, we extend it together with a new requirement (AI tools welcome on the call too), and we talk infrastructure where you will be looking at some terraform IaC and identifying pre-seeded issues. You’ll meet our other engineer, Mila, during it.

If anything is unclear or you have any questions please email [steph@surreal.live](mailto:steph@surreal.live) and I’ll be happy to answer anything / provide more clarity.
