import ShimmieTestStack from "shimmiestack/shimmieteststack";
import { EntertainerCommand } from "../src/entertainer/command";
import { EntertainerModel } from "../src/entertainer/model";
import { EntertainerQuery } from "../src/entertainer/query";
import { BookingModel } from "../src/booking/model";
import { PaymentModel } from "../src/payment/model";
import { RecordModels, SubscribeModels } from "../src/events";

function makeStack() {
  const stack = ShimmieTestStack<RecordModels, SubscribeModels>();
  const entertainerModel = EntertainerModel(stack);
  const bookingModel = BookingModel(stack);
  const paymentModel = PaymentModel(stack);
  stack.mountTest(EntertainerCommand(stack), "/entertainers");
  stack.mountTest(EntertainerQuery(entertainerModel, bookingModel, paymentModel), "/entertainers");
  return { stack };
}

const anEntertainer = { name: "The Amplifiers", genre: "rock" };

describe("creating an entertainer", () => {
  it("should record the entertainer and make it queryable", async () => {
    const { stack } = makeStack();

    const created = await stack.testPost({
      path: "/entertainers",
      body: anEntertainer,
      expectedResponseCode: 201,
    });
    const { entertainerId } = created.body;
    expect(entertainerId).toBeTruthy();

    const fetched = await stack.testGet({
      path: `/entertainers/${entertainerId}`,
      expectedResponseCode: 200,
    });
    expect(fetched.body).toEqual({ entertainerId, ...anEntertainer });
  });

  it("should give each entertainer a distinct id", async () => {
    const { stack } = makeStack();

    const first = await stack.testPost({
      path: "/entertainers",
      body: anEntertainer,
      expectedResponseCode: 201,
    });
    const second = await stack.testPost({
      path: "/entertainers",
      body: { name: "Trivia Tim", genre: "quiz" },
      expectedResponseCode: 201,
    });
    expect(first.body.entertainerId).not.toBe(second.body.entertainerId);

    const fetched = await stack.testGet({
      path: `/entertainers/${second.body.entertainerId}`,
      expectedResponseCode: 200,
    });
    expect(fetched.body.name).toBe("Trivia Tim");
  });
});

describe("validating a new entertainer", () => {
  it.each([
    ["a missing name", { genre: "rock" }, "name"],
    ["a blank name", { ...anEntertainer, name: "   " }, "name"],
    ["a non-string name", { ...anEntertainer, name: 42 }, "name"],
    ["a missing genre", { name: "The Amplifiers" }, "genre"],
    ["a blank genre", { ...anEntertainer, genre: "" }, "genre"],
    ["a non-string genre", { ...anEntertainer, genre: ["rock"] }, "genre"],
  ])("should reject %s", async (_label, body, field) => {
    const { stack } = makeStack();
    const res = await stack.testPost({
      path: "/entertainers",
      body,
      expectedResponseCode: 400,
    });
    expect(res.body.errors[field]).toBeTruthy();
  });

  it("should report every invalid field at once", async () => {
    const { stack } = makeStack();
    const res = await stack.testPost({
      path: "/entertainers",
      body: {},
      expectedResponseCode: 400,
    });
    expect(Object.keys(res.body.errors).sort()).toEqual(["genre", "name"]);
  });
});

describe("fetching an entertainer", () => {
  it("should return 404 when the entertainer does not exist", async () => {
    const { stack } = makeStack();
    const res = await stack.testGet({
      path: "/entertainers/not-a-real-entertainer",
      expectedResponseCode: 404,
    });
    expect(res.body.error).toContain("not-a-real-entertainer");
  });
});
