/** Payment read model. Rebuilt from the event log on startup.
 *
 * Deliberately status-agnostic: a payment is recorded regardless of the status of the booking.
 * Future work should include refund handling for cancelled bookings, on clarification of 
 * requirements around non-refundable deposits.
*/
import { StackType } from "shimmiestack";
import { PaymentRecordedEvent, RecordModels, SubscribeModels } from "../events";

export interface Payment {
  paymentId: string;
  reference: string;
  bookingId: string;
  amountCents: number;
  paidAt: string;
}

export function PaymentModel(stack: StackType<RecordModels, SubscribeModels>) {
  // A reference only needs to be unique within a booking, so key on both.
  const paymentsByBookingReference = new Map<string, PaymentRecordedEvent>();
  const key = (bookingId: string, reference: string) =>
    JSON.stringify([bookingId, reference]);

  stack.subscribe("PAYMENT_RECORDED_EVENT", (event) => {
    paymentsByBookingReference.set(
      key(event.data.bookingId, event.data.reference),
      event.data,
    );
  });

  return {
    getPayment: (
      bookingId: string,
      reference: string,
    ): PaymentRecordedEvent | undefined =>
      paymentsByBookingReference.get(key(bookingId, reference)),
  };
}
export type PaymentModelType = ReturnType<typeof PaymentModel>;
