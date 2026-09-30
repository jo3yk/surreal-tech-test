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
  const paymentsByReference = new Map<string, PaymentRecordedEvent>();

  stack.subscribe("PAYMENT_RECORDED_EVENT", (event) => {
    paymentsByReference.set(event.data.reference, event.data);
  });

  return {
    getPaymentByReference: (reference: string): PaymentRecordedEvent | undefined =>
      paymentsByReference.get(reference),
  };
}
export type PaymentModelType = ReturnType<typeof PaymentModel>;
