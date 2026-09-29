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
  const paymentsById = new Map<string, PaymentRecordedEvent>();
  const paymentsByReference = new Map<string, PaymentRecordedEvent>();
  const paymentsByBookingId = new Map<string, Payment[]>();


  stack.subscribe("PAYMENT_RECORDED_EVENT", (event) => {
    const { paymentId, reference, bookingId, amountCents, paidAt } = event.data;
    paymentsById.set(paymentId, event.data);
    paymentsByReference.set(reference, event.data);
    const payments = paymentsByBookingId.get(bookingId) ?? [];
    payments.push({ paymentId, reference, bookingId, amountCents, paidAt });
    paymentsByBookingId.set(bookingId, payments);
  });

  return {
    getPayment: (paymentId: string): PaymentRecordedEvent | undefined =>
      paymentsById.get(paymentId),

    getPaymentByReference: (reference: string): PaymentRecordedEvent | undefined =>
      paymentsByReference.get(reference),

    getPaymentsForBooking: (bookingId: string): Payment[] =>
      paymentsByBookingId.get(bookingId) ?? [],
  };
}
export type PaymentModelType = ReturnType<typeof PaymentModel>;
