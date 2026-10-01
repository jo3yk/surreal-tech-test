import ShimmieTestStack from "shimmiestack/shimmieteststack";
import { DebugQuery } from "../src/debug";
import { RecordModels, SubscribeModels } from "../src/events";

describe("GET /debug/memory", () => {
  it("should report process memory in megabytes", async () => {
    const stack = ShimmieTestStack<RecordModels, SubscribeModels>();
    stack.mountTest(DebugQuery(), "/debug");

    const res = await stack.testGet({
      path: "/debug/memory",
      expectedResponseCode: 200,
    });

    expect(res.body.heapUsedMb).toBeGreaterThan(0);
    expect(res.body.rssMb).toBeGreaterThanOrEqual(res.body.heapUsedMb);
    expect(res.body.heapTotalMb).toBeGreaterThanOrEqual(res.body.heapUsedMb);
    expect(res.body.externalMb).toBeGreaterThanOrEqual(0);
  });
});
