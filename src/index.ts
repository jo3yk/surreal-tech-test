import ShimmieStack from "shimmiestack";
import { noAuthorization } from "shimmiestack/authorizers";
import { BookingCommand } from "./booking/command";
import { BookingModel } from "./booking/model";
import { BookingQuery } from "./booking/query";
import { EntertainerCommand } from "./entertainer/command";
import { EntertainerModel } from "./entertainer/model";
import { EntertainerQuery } from "./entertainer/query";
import { MemoryEventBase } from "./eventbase";
import { RecordModels, SubscribeModels } from "./events";
import { VenueCommand } from "./venue/command";
import { VenueQuery } from "./venue/query";
import { VenueModel } from "./venue/model";
import { PaymentModel } from "./payment/model";

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
const venueModel = VenueModel(stack);

const entertainerModel = EntertainerModel(stack);
const paymentModel = PaymentModel(stack);
stack
  .setApiVersion("/v1")
  .mountProcessor(
    "Booking Command",
    "/bookings",
    BookingCommand(stack, bookingModel, venueModel, entertainerModel, paymentModel),
  )
  .mountProcessor("Booking Query", "/bookings", BookingQuery(bookingModel))
  .mountProcessor("Venue Command", "/venues", VenueCommand(stack))
  .mountProcessor("Venue Query", "/venues", VenueQuery(bookingModel, venueModel))
  .mountProcessor("Entertainer Command", "/entertainers", EntertainerCommand(stack))
  .mountProcessor("Entertainer Query", "/entertainers", EntertainerQuery(entertainerModel, bookingModel, paymentModel))
  .registerPostInitFn(() => {
    console.log("Booking ledger is up. Try the Bruno collection in ./bruno");
  })
  .startup();
