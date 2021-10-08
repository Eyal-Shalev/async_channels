import { Queue } from "./queue.ts";
import { assertThrows } from "deno/testing/asserts.ts";

Deno.test("invalid capacity", () => {
  assertThrows(() => new Queue(-1), RangeError);
  assertThrows(() => new Queue(0.1), RangeError);
});
