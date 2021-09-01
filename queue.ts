export class Queue<T> {
  protected queue: T[] = [];

  constructor(readonly capacity: number) {
    if (capacity < 0 || !Number.isSafeInteger(capacity)) {
      throw new RangeError(
        "queue capacity must be a non-negative safe integer",
      );
    }
  }

  add(val: T) {
    if (this.isFull) throw new RangeError("queue is full");
    this.queue.push(val);
  }

  remove(): T {
    if (this.isEmpty) throw new RangeError("queue is empty");
    return this.queue.shift() as T;
  }

  peek(): T {
    if (this.isEmpty) throw new RangeError("queue is empty");
    return this.queue[0] as T;
  }

  get isFull(): boolean {
    return this.queue.length === this.capacity;
  }

  get isEmpty(): boolean {
    return this.queue.length === 0;
  }
}