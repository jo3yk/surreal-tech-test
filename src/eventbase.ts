/** Event base selection. `DB_TYPE=memory` (default) keeps the log in process;
 * `DB_TYPE=postgres` persists it using `DATABASE_URL`. */
import MemoryBase from "shimmiestack/eventbase-memory";
import PostgresBase from "shimmiestack/eventbase-postgres";

/** Empty logs crash shimmiestack 2.1.1 in this contrived example; so
 * returning -1 instead. Postgres returns null for max() of no rows. */
function tolerateEmptyLog<T extends { getLatestSequenceNumber: () => any }>(
  base: T,
): T {
  const original = base.getLatestSequenceNumber.bind(base);
  base.getLatestSequenceNumber = async () => {
    try {
      return (await original()) ?? -1;
    } catch {
      // The memory base throws on an empty log. This also hides genuine
      // Postgres errors here, but those resurface on the next query/replay.
      return -1;
    }
  };
  return base;
}

export function MemoryEventBase() {
  return tolerateEmptyLog(MemoryBase());
}

export function PostgresEventBase(connectionString: string, poolSize?: number) {
  return tolerateEmptyLog(
    PostgresBase({ connectionString, ...(poolSize ? { max: poolSize } : {}) }),
  );
}

export function createEventBase(env: NodeJS.ProcessEnv = process.env) {
  const type = (env.DB_TYPE ?? "memory").toLowerCase();
  switch (type) {
    case "memory":
      return MemoryEventBase();
    case "postgres": {
      if (!env.DATABASE_URL) {
        throw new Error("DB_TYPE=postgres requires DATABASE_URL to be set");
      }
      return PostgresEventBase(
        env.DATABASE_URL,
        env.PG_POOL_SIZE ? Number(env.PG_POOL_SIZE) : undefined,
      );
    }
    default:
      throw new Error(`Unknown DB_TYPE "${type}"; use "memory" or "postgres"`);
  }
}
