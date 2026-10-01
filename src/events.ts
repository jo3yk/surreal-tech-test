/**
 * Event payloads. RecordModels = write shape; SubscribeModels = read shape.
 *
 * ShimmieStack uses these two maps for type safety: recordEvent() checks the
 * payload against RecordModels[eventName], and subscribe() types the handler
 * against SubscribeModels[eventName].
 *
 * They are identical today. They diverge once old event versions exist in the
 * log: SubscribeModels handlers must cope with every historical shape
 * (e.g. `BookingConfirmedEventV1 | BookingConfirmedEventV2`), while
 * RecordModels only ever writes the latest shape.
 */

export interface BookingConfirmedEvent {
  bookingId: string;
  venueId: string;
  entertainerId: string;
  entertainerName: string;
  feeCents: number;
  /** ISO-8601. */
  startsAt: string;
}

export interface BookingCancelledEvent {
  bookingId: string;
  reason: string;
}

export interface VenueCreatedEvent {
  venueId: string;
  name: string;
  capacity: number;
}

export interface EntertainerCreatedEvent {
  entertainerId: string;
  name: string;
  genre: string;
}

export interface PaymentRecordedEvent {
  paymentId: string;
  reference: string;
  bookingId: string;
  amountCents: number;
  paidAt: string;
}

export type RecordModels = {
  BOOKING_CONFIRMED_EVENT: BookingConfirmedEvent;
  BOOKING_CANCELLED_EVENT: BookingCancelledEvent;
  VENUE_CREATED_EVENT: VenueCreatedEvent;
  ENTERTAINER_CREATED_EVENT: EntertainerCreatedEvent;
  PAYMENT_RECORDED_EVENT: PaymentRecordedEvent;
};

export type SubscribeModels = {
  BOOKING_CONFIRMED_EVENT: BookingConfirmedEvent;
  BOOKING_CANCELLED_EVENT: BookingCancelledEvent;
  VENUE_CREATED_EVENT: VenueCreatedEvent;
  ENTERTAINER_CREATED_EVENT: EntertainerCreatedEvent;
  PAYMENT_RECORDED_EVENT: PaymentRecordedEvent;
};
