import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import {StateMachine} from "./state-machine.ts";

Deno.test(new URL("", import.meta.url).pathname, async () => {
  const stack = new StateMachine<any>();
  assertEquals(
    1,2
  )
  // console.log(await Promise.allSettled([
  //   stack.pop().then(val => ({pop: val})),
  //   stack.push("a").then(() => ({push: true})),
  //   stack.push("b").then(() => ({push: true})),
  //   stack.pop().then(val => ({pop: val})),
  // ]));
});