import { AsyncQueue, AsyncQueueOptions } from "./internal/async-queue.ts";

export type ChannelOptions = AsyncQueueOptions;

export class Channel<T> extends AsyncQueue<T> {
  constructor(capacity = 0, protected readonly options?: ChannelOptions) {
    super(capacity, options);
  }
}

export interface SelectOptions<T> {
  default: T;
}

export async function select<T>(
  items: (Channel<T> | [Channel<T>, T])[],
  options?: SelectOptions<T> | Exclude<SelectOptions<T>, "default">,
): Promise<[T, Channel<T>] | [true, Channel<T>] | [unknown, undefined]> {
  const abortCtrl = new AbortController();
  const selectPromises: Promise<void | T>[] = items.map((item) => {
    if (item instanceof Channel) return item.remove(abortCtrl);
    return item[0].add(item[1], abortCtrl);
  });

  let defaultPromise = Promise.reject<T>();
  if (options && "default" in options) {
    defaultPromise = Promise.resolve<T>(options.default);
  }

  const results = await Promise.allSettled([...selectPromises, defaultPromise]);

  for (let i = 0; i < results.length; i++) {
    const item = items[i];
    const result = results[i];
    if (result.status === "rejected") continue;

    if (item instanceof Channel) {
      return [result.value as T, item];
    }

    if (Array.isArray(item)) {
      return [true, item[0]];
    }

    return [result.value, undefined];
  }

  throw new Error("Unreachable");
}
