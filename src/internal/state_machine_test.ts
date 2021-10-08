import { Idle, InvalidTransitionError } from "./state_machine.ts";
import { assertThrows } from "deno/testing/asserts.ts";

Deno.test("get -> get", () => {
  const state = Idle(() => {}).get();
  assertThrows(() => state.get(), InvalidTransitionError);
});

Deno.test("send -> send", () => {
  const state = Idle(() => {}).send(null);
  assertThrows(() => state.send(null), InvalidTransitionError);
});

Deno.test("close -> *", () => {
  const state = Idle(() => {}).close();
  assertThrows(() => state.get(), InvalidTransitionError);
  assertThrows(() => state.send(null), InvalidTransitionError);
  state.close();
});
