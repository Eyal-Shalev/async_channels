import { isNonNegativeSafeInteger } from "./utils.ts";

/** @internal */
export class Queue<T> {
  protected queue: T[] = [];

  constructor(readonly capacity: number) {
    if (!isNonNegativeSafeInteger(capacity)) {
      throw new RangeError(
        "queue capacity must be a non-negative safe integer",
      );
    }
  }

  enqueue(val: T) {
    if (this.isFull) throw new RangeError("queue is full");
    this.queue.push(val);
  }

  dequeue(): T {
    if (this.isEmpty) throw new RangeError("queue is empty");
    return this.queue.shift() as T;
  }

  get isFull(): boolean {
    return this.queue.length === this.capacity;
  }

  get isEmpty(): boolean {
    return this.queue.length === 0;
  }
}
