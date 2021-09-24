import { Channel, ChannelOptions, Receiver } from "./channel.ts";
import {
  ignoreAbortedError,
  isPositiveSafeInteger,
  makeAbortCtrl,
  recordWithDefaults,
} from "./internal/utils.ts";

/**
 * Options for pipe operations.
 */
export interface ChannelPipeOptions extends ChannelOptions {
  /**
   * A safe and positive integer representing the channel buffer size.
   * A `bufferSize` of `0` indicates a channel without any buffer.
   * @type {number}
   */
  bufferSize?: number;
  /**
   * If provided, the pipe operation will halt when the signal is triggered.
   *
   * @type {AbortSignal}
   */
  signal?: AbortSignal;
}

export function map<T, TOut>(
  fn: (val: T) => TOut | Promise<TOut>,
  pipeOpts?: ChannelPipeOptions,
) {
  return (target: Receiver<T>): Receiver<TOut> => {
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<TOut>(
      bufferSize ?? target.bufferSize,
      options,
    );
    (async () => {
      while (true) {
        const res = await target.receive(makeAbortCtrl(signal));
        if (!res[1]) return;
        await outChan.send(await fn(res[0]), makeAbortCtrl(signal));
      }
    })().catch(ignoreAbortedError)
      .catch((err) => target.error("map", fn, err))
      .finally(() => outChan.close());
    return outChan;
  };
}

export function flat<TElem>(
  pipeOpts?: ChannelPipeOptions,
) {
  return (target: Receiver<Iterable<TElem> | AsyncIterable<TElem>>) => {
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<TElem>(
      bufferSize ?? target.bufferSize,
      options,
    );
    (async () => {
      while (true) {
        const res = await target.receive(makeAbortCtrl(signal));
        if (!res[1]) return;

        for await (const item of res[0]) {
          await outChan.send(item, makeAbortCtrl(signal));
        }
      }
    })().catch(ignoreAbortedError)
      .catch((err) => target.error("flat", err))
      .finally(() => outChan.close());

    return outChan;
  };
}

export function flatMap<T, TOut>(
  fn: (val: T) => Iterable<TOut> | AsyncIterable<TOut>,
  pipeOpts?: ChannelPipeOptions,
) {
  return (target: Receiver<T>) => {
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<TOut>(
      bufferSize ?? target.bufferSize,
      options,
    );
    (async () => {
      while (true) {
        const res = await target.receive(makeAbortCtrl(signal));
        if (!res[1]) return;
        for await (const item of fn(res[0])) {
          await outChan.send(item, makeAbortCtrl(signal));
        }
      }
    })().catch(ignoreAbortedError)
      .catch((err) => target.error("flatMap", fn, err))
      .finally(() => outChan.close());
    return outChan;
  };
}

export function forEach<T>(
  fn: (val: T) => unknown | Promise<unknown>,
  pipeOpts?: ChannelPipeOptions,
) {
  return (target: Receiver<T>) => {
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<void>(
      bufferSize ?? target.bufferSize,
      options,
    );
    (async () => {
      while (true) {
        const res = await target.receive(makeAbortCtrl(signal));
        if (!res[1]) return;
        await fn(res[0]);
      }
    })().catch(ignoreAbortedError)
      .catch((err) => target.error("forEach", fn, err))
      .finally(() => outChan.close());
    return outChan;
  };
}

export function filter<T>(
  fn: (val: T) => boolean | Promise<boolean>,
  pipeOpts?: ChannelPipeOptions,
) {
  return (target: Receiver<T>) => {
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<T>(bufferSize ?? target.bufferSize, options);
    (async () => {
      while (true) {
        const res = await target.receive(makeAbortCtrl(signal));
        if (!res[1]) return;
        if (!(await fn(res[0]))) continue;
        await outChan.send(res[0], makeAbortCtrl(signal));
      }
    })().catch(ignoreAbortedError)
      .catch((err) => target.error("filter", fn, err))
      .finally(() => outChan.close());
    return outChan;
  };
}

export function reduce<T>(
  fn: (prev: T, current: T) => T | Promise<T>,
  pipeOpts?: ChannelPipeOptions,
) {
  return (target: Receiver<T>) => {
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<T>(bufferSize ?? target.bufferSize, options);

    (async () => {
      let prev: T;

      const res = await target.receive(makeAbortCtrl(signal));
      if (!res[1]) return;
      prev = res[0];

      while (true) {
        const res = await target.receive(makeAbortCtrl(signal));
        if (!res[1]) {
          return await outChan.send(prev, makeAbortCtrl(signal));
        }
        prev = await fn(prev, res[0]);
      }
    })().catch(ignoreAbortedError)
      .catch((err) => target.error("reduce", fn, err))
      .finally(() => outChan.close());

    return outChan;
  };
}

export function groupBy<T, TKey extends (string | symbol)>(
  fn: (val: T) => TKey | Promise<TKey>,
  pipeOpts?: ChannelPipeOptions,
) {
  return (target: Receiver<T>) => {
    const { signal, bufferSize, debugExtra, ...options } = pipeOpts ?? {};
    const out = recordWithDefaults(
      {} as Record<TKey, Channel<T>>,
      (prop) => {
        return new Channel<T>(bufferSize ?? target.bufferSize, {
          ...options,
          debugExtra: { prop, ...debugExtra },
        });
      },
    );

    (async () => {
      while (true) {
        const res = await target.receive(makeAbortCtrl(signal));
        if (!res[1]) return;
        const key = await fn(res[0]);
        await out[key].send(res[0], makeAbortCtrl(signal));
      }
    })().catch(ignoreAbortedError)
      .catch((err) => target.error("groupBy", fn, err))
      .finally(() => {
        Object.values<Channel<T>>(out).forEach((ch) => ch.close());
      });

    return out;
  };
}

export type ChannelDuplicateSendMode =
  | "WaitForAll"
  | "WaitForOne"
  | "ContinueImmediately";

export interface ChannelDuplicateOptions extends ChannelPipeOptions {
  sendMode: ChannelDuplicateSendMode;
}

export function duplicate<T>(n = 2, pipeOpts?: ChannelDuplicateOptions) {
  return (target: Receiver<T>) => {
    const {
      sendMode: sendModesTmp,
      signal,
      bufferSize,
      debugExtra,
      ...options
    } = pipeOpts ?? {};
    const sendMode = sendModesTmp ?? "WaitForAll";
    if (!isPositiveSafeInteger(n)) {
      throw new TypeError(`${n} is not a safe integer larger than 1`);
    }
    if (n < 2) throw new RangeError(`${n} is not a safe integer larger than 1`);
    const arrOut = [] as Channel<T>[];
    for (let i = 0; i < n; i++) {
      arrOut[i] = new Channel(bufferSize ?? target.bufferSize, {
        ...options,
        debugExtra: { i, ...debugExtra },
      });
    }

    (async () => {
      while (true) {
        const res = await target.receive(makeAbortCtrl(signal));
        if (!res[1]) return;

        switch (sendMode) {
          case "WaitForAll":
            await Promise.all(
              arrOut.map((ch) => ch.send(res[0], makeAbortCtrl(signal))),
            );
            break;

          case "WaitForOne":
            await Promise.race(
              arrOut.map((ch) => ch.send(res[0], makeAbortCtrl(signal))),
            );
            break;

          case "ContinueImmediately":
            Promise.all(
              arrOut.map((ch) => ch.send(res[0], makeAbortCtrl(signal))),
            )
              .catch((err) => target.error("duplicate", n, err));
            break;
        }
      }
    })().catch(ignoreAbortedError)
      .catch((err) => target.error("duplicate", n, err))
      .finally(() => arrOut.forEach((ch) => ch.close()));

    return arrOut;
  };
}
