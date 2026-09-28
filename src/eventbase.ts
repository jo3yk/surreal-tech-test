/** Memory event base. Empty logs crash shimmiestack 2.1.1 in this contrived
 * example; so returning -1 instead.
 * We use the postgres event base in our codebase... just using the memory
 * one here to avoid needing to spin up any DBs for this test. */
import EventBase from "shimmiestack/eventbase-memory";

export function MemoryEventBase() {
  const base = EventBase();
  const original = base.getLatestSequenceNumber.bind(base);
  base.getLatestSequenceNumber = async () => {
    try {
      return await original();
    } catch {
      return -1;
    }
  };
  return base;
}
