# Notes

# Part 0 - initial improvements

On first review, I noticed that the venueId and entertainerId referenced in a Booking aren't backed by anything in the data model - there's nothing to stop the caller creating bookings against completely unknown venues/entertainers.

The POST Booking request also looked a little iffy, with the type being BookingConfirmedEvent (containing a bookingId field which should not be supplied by the caller).

Added a Bruno collection to aid testing.

# Part 1
