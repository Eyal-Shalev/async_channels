import { AsyncQueue, AsyncQueueOptions } from "async-queue/async-queue.ts";
import {
  AddStuck,
  Idle,
  RemoveStuck,
  WaitingForAck,
} from "async-queue/state-machine.ts";

export class SelectAbortedError extends Error {
  constructor() {
    super("Select Aborted");
  }
}

export type ChannelOptions = AsyncQueueOptions;

export class Channel<T> extends AsyncQueue<T> {
  constructor(capacity = 0, protected readonly options?: ChannelOptions) {
    super(capacity, options);
  }

  async abortableRemove(abortCtrl: AbortController): Promise<T> {
    const abortPromise = makeAbortPromise(abortCtrl);

    if ([RemoveStuck, WaitingForAck].includes(this.current)) {
      await Promise.race([this.waitForState(Idle), abortPromise]);
    }

    if (abortCtrl.signal.aborted) throw new SelectAbortedError();

    if (this.current === Idle && !this.queue.isEmpty) {
      abortCtrl.abort();
      return this.remove();
    }

    await Promise.race([this.waitForState(AddStuck), abortPromise]);
    if (abortCtrl.signal.aborted) throw new SelectAbortedError();

    abortCtrl.abort();
    return this.remove();
  }

  async abortableAdd(val: T, abortCtrl: AbortController): Promise<void> {
    const abortPromise = makeAbortPromise(abortCtrl);

    if ([AddStuck, WaitingForAck].includes(this.current)) {
      await Promise.race([this.waitForState(Idle), abortPromise]);
    }

    if (abortCtrl.signal.aborted) throw new SelectAbortedError();

    if (this.current === Idle && !this.queue.isFull) {
      abortCtrl.abort();
      return this.add(val);
    }

    await Promise.race([this.waitForState(RemoveStuck), abortPromise]);
    if (abortCtrl.signal.aborted) throw new SelectAbortedError();

    abortCtrl.abort();
    return this.add(val);
  }
}

function makeAbortPromise(abortCtrl: AbortController) {
  return new Promise<void>((resolve) => {
    abortCtrl.signal.addEventListener("abort", () => resolve());
  });
}

export interface SelectOptions {
  default?: unknown;
}
export async function select<T>(
  items: (Channel<T> | [Channel<T>, T])[],
  options?: SelectOptions,
): Promise<[T, Channel<T>] | [true, Channel<T>] | [unknown, undefined]> {
  const ctrl = new AbortController();

  const selectPromises = items.map((item) => {
    if (item instanceof Channel) return item.abortableRemove(ctrl);
    return item[0].abortableAdd(item[1], ctrl);
  });

  const results = await Promise.allSettled(selectPromises);

  for (let i = 0; i < results.length; i++) {
    const item = items[i];
    const result = results[i];
    if (result.status === "rejected") continue;

    if (item instanceof Channel) {
      return [result.value as T, item];
    }

    return [true, item[0]];
  }

  return [options?.default, undefined];
}
