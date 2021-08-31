import { assertEquals } from "https://deno.land/std/testing/asserts.ts";

import {EmptyState, StateNames, Transition} from "./state-machine-old.ts"

Deno.test("state-machine-old.test.ts", () => {
  assertEquals(EmptyState.stateName, StateNames.EMPTY);
  assertEquals(EmptyState(Transition.POP_STUCK).stateName, StateNames.WAIT_FOR_PUSH);
  assertEquals(EmptyState(Transition.PUSH_STUCK).stateName, StateNames.WAIT_FOR_POP);
  assertEquals(EmptyState(Transition.POP_STUCK)(Transition.PUSH_STUCK), EmptyState);
  assertEquals(EmptyState(Transition.POP_STUCK)(Transition.POP_STUCK).stateName, StateNames.WAIT_FOR_PUSH);
  assertEquals(EmptyState(Transition.POP_STUCK)(Transition.POP_STUCK).overSize, 2);
  assertEquals(EmptyState(Transition.PUSH_STUCK)(Transition.PUSH_STUCK).stateName, StateNames.WAIT_FOR_POP);
  assertEquals(EmptyState(Transition.PUSH_STUCK)(Transition.PUSH_STUCK).overSize, 2);
  assertEquals(EmptyState(Transition.POP_STUCK)(Transition.POP_STUCK)(Transition.PUSH_STUCK)(Transition.PUSH_STUCK), EmptyState);
  assertEquals(EmptyState(Transition.PUSH_STUCK)(Transition.PUSH_STUCK)(Transition.POP_STUCK)(Transition.POP_STUCK), EmptyState);
})