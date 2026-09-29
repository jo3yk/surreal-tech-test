/** In-memory read/command model. Rebuilt from the event log on startup. */
import { StackType } from "shimmiestack";
import { RecordModels, SubscribeModels } from "../events";

export interface Entertainer {
  entertainerId: string;
  name: string;
  genre: string;
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
