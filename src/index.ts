import ShimmieStack from "shimmiestack";
import { noAuthorization } from "shimmiestack/authorizers";
import { BookingCommand } from "./booking/command";
import { BookingModel } from "./booking/model";
import { BookingQuery } from "./booking/query";
import { MemoryEventBase } from "./eventbase";
import { RecordModels, SubscribeModels } from "./events";
import { VenueQuery } from "./venue/query";

const stack = ShimmieStack<RecordModels, SubscribeModels>(
  {
    ServerPort: Number(process.env.PORT ?? 8080),
    enforceAuthorization: false,
  },
  /** In-memory event base; restart loses the log. */
  MemoryEventBase(),
  noAuthorization,
);

const bookingModel = BookingModel(stack);

stack
  .setApiVersion("/v1")
  .mountProcessor(
    "Booking Command",
    "/bookings",
    BookingCommand(stack, bookingModel),
  )
  .mountProcessor("Booking Query", "/bookings", BookingQuery(bookingModel))
  .mountProcessor("Venue Query", "/venues", VenueQuery(bookingModel))
  .registerPostInitFn(() => {
    console.log("Booking ledger is up. Try:");
    console.log(
      '  curl -s localhost:8080/v1/bookings -X POST -H "content-type: application/json" \\',
    );
    console.log(
      `    -d '{"venueId":"the-espy","entertainerId":"ent-1","entertainerName":"The Amplifiers","feeCents":45000,"startsAt":"2026-11-05T20:00:00+11:00"}'`,
    );
  })
  .startup();
