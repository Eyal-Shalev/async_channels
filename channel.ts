import {
  AbortedError,
  AsyncQueue,
  AsyncQueueOptions,
  makeAbortPromise,
} from "./async-queue.ts";
import {
  AddStuck,
  Idle,
  // RemoveStuck,
  // WaitingForAck,
} from "./state-machine.ts";

export type ChannelOptions = AsyncQueueOptions;

export class Channel<T> extends AsyncQueue<T> {
  constructor(capacity = 0, protected readonly options?: ChannelOptions) {
    super(capacity, options);
  }
}

export interface SelectOptions {
  default?: unknown;
}
export async function select<T>(
  items: (Channel<T> | [Channel<T>, T])[],
  abortCtrl = new AbortController(),
  options?: SelectOptions,
): Promise<[T, Channel<T>] | [true, Channel<T>] | [unknown, undefined]> {
  const selectPromises = items.map((item) => {
    if (item instanceof Channel) return item.remove(abortCtrl);
    return item[0].add(item[1], abortCtrl);
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

  throw new Error("Unreachable");
}
