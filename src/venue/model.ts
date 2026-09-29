/** In-memory read/command model. Rebuilt from the event log on startup. */
import { StackType } from "shimmiestack";
import { RecordModels, SubscribeModels } from "../events";

export interface Venue {
  venueId: string,
  name: string,
  capacity: number
}

export function VenueModel(
  stack: StackType<RecordModels, SubscribeModels>
) {
  const venuesById = new Map<string, Venue>();

  stack.subscribe("VENUE_CREATED_EVENT", (event) => {
    const { venueId, name, capacity } = event.data;
    venuesById.set(venueId, { venueId, name, capacity })
  })

  return {
    getVenue: (venueId: string): Venue | undefined =>
      venuesById.get(venueId)
  }
}

export type VenueModelType = ReturnType<typeof VenueModel>;