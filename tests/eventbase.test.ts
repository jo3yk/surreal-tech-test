import { MemoryEventBase } from "../src/eventbase";

describe("MemoryEventBase", () => {
  it("should report -1 as the latest sequence number for an empty log", async () => {
    const base = MemoryEventBase();
    await expect(base.getLatestSequenceNumber()).resolves.toBe(-1);
  });
});
