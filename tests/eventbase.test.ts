import { MemoryEventBase, createEventBase } from "../src/eventbase";

describe("MemoryEventBase", () => {
  it("should report -1 as the latest sequence number for an empty log", async () => {
    const base = MemoryEventBase();
    await expect(base.getLatestSequenceNumber()).resolves.toBe(-1);
  });
});

describe("createEventBase", () => {
  it("defaults to the memory event base", async () => {
    const base = createEventBase({});
    await expect(base.getLatestSequenceNumber()).resolves.toBe(-1);
  });

  it("requires DATABASE_URL for postgres", () => {
    expect(() => createEventBase({ DB_TYPE: "postgres" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects an unknown DB_TYPE", () => {
    expect(() => createEventBase({ DB_TYPE: "mysql" })).toThrow(/Unknown DB_TYPE/);
  });
});
