import { Queue } from "./queue.ts";
import { assert, assertEquals, assertThrows } from "deno/testing/asserts.ts";

Deno.test("invalid capacity", () => {
  assertThrows(() => new Queue(0.1), RangeError);
});

Deno.test("Queue(1)", () => {
  const q = new Queue(1);
  assert(q.isEmpty && !q.isFull);
  q.enqueue(0);
  assert(!q.isEmpty && q.isFull);
  assertThrows(() => q.enqueue(1), RangeError);
  assertEquals(q.dequeue(), 0);
  assertThrows(() => q.dequeue(), RangeError);
  assert(q.isEmpty && !q.isFull);
});

Deno.test("Queue(0)", () => {
  const q = new Queue(0);
  assert(q.isEmpty && q.isFull);
  assertThrows(() => q.enqueue(0), RangeError);
  assertThrows(() => q.dequeue(), RangeError);
});

Deno.test("Queue(-1)", () => {
  const q = new Queue(-1);
  assert(q.isEmpty && !q.isFull);
  q.enqueue(0);
  q.enqueue(1);
  assert(!q.isEmpty && !q.isFull);
  assertEquals(q.dequeue(), 0);
  assertEquals(q.dequeue(), 1);
  assert(q.isEmpty && !q.isFull);
});
