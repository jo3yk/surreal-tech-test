/** In-memory read/command model. Rebuilt from the event log on startup. */
import { StackType } from "shimmiestack";
import { RecordModels, SubscribeModels } from "../events";
import { BookingEarnings } from "../booking/model";

export interface Entertainer {
  entertainerId: string;
  name: string;
  genre: string;
}

export interface EntertainerEarnings {
  entertainerId: string;
  entertainerName?: string;
  totalPaidCents: number;
  totalOutstandingCents: number;
  bookings: BookingEarnings[];
}

export function EntertainerModel(
  stack: StackType<RecordModels, SubscribeModels>,
) {
  const entertainersById = new Map<string, Entertainer>();

  stack.subscribe("ENTERTAINER_CREATED_EVENT", (event) => {
    const { entertainerId, name, genre } = event.data;
    entertainersById.set(entertainerId, { entertainerId, name, genre });
  });

  return {
    getEntertainer: (entertainerId: string): Entertainer | undefined =>
      entertainersById.get(entertainerId),
  };
}

export type EntertainerModelType = ReturnType<typeof EntertainerModel>;
