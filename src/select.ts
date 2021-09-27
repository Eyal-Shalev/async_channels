import { Channel, Receiver, Sender } from "./channel.ts";
import { BroadcastChannel } from "./broadcast.ts";
import { isReceiver, sleep } from "./internal/utils.ts";

/**
 * Extra options used for the `select` function.
 */
export interface SelectOptions<TDefault = never> {
  default: TDefault;
  abortCtrl?: AbortController;
}

export type SelectOperation<T> =
  | Receiver<T>
  | [Sender<T>, T]
  | [BroadcastChannel<T, unknown>, T];
export type SelectDefaultResult<T> = [T, undefined];
export type SelectOperationResult<T> =
  | [T, Receiver<T>]
  | [true, Sender<T>]
  | [true, BroadcastChannel<T, unknown>];
export type SelectResult<T, TDefault> = (
  | SelectOperationResult<T>
  | SelectDefaultResult<TDefault>
);

export async function select(
  ops: [],
  options?:
    | SelectOptions<never>
    | Omit<SelectOptions<never>, "default">,
): Promise<never>;

export async function select<T, TDefault = never>(
  ops: [SelectOperation<T>],
  options?:
    | SelectOptions<TDefault>
    | Omit<SelectOptions<TDefault>, "default">,
): Promise<SelectResult<T, TDefault>>;

export async function select<T1, T2, TDefault = never>(
  ops: [SelectOperation<T1>, SelectOperation<T2>],
  options?:
    | SelectOptions<TDefault>
    | Omit<SelectOptions<TDefault>, "default">,
): Promise<
  | SelectOperationResult<T1>
  | SelectOperationResult<T2>
  | SelectDefaultResult<TDefault>
>;
export async function select<T, TDefault = never>(
  ops: Exclude<SelectOperation<T>[], []>,
  options?:
    | SelectOptions<TDefault>
    | Omit<SelectOptions<TDefault>, "default">,
): Promise<SelectResult<T, TDefault>>;
/**
 * `select` takes a list of channel operations, and completes **at-most** one of
 * them (the first operation that is ready).
 *
 * If the `default` option is provided, and no operation is immediately read,
 * then all the operations will be aborted and the default value is returned.
 *
 * @template T, TDefault
 * @param {(Receiver<T> | [Sender<T>, T])[]} ops
 *   A list of channel operations.
 *   Each item in this list can be either a receiver or a tuple of a sender and
 *   the value to send.
 * @param {SelectOptions<T> | Omit<SelectOptions<T>, "default">} options
 *   The options for `select`.
 *   *Note: `undefined` is considered a valid value for `default`, so if you
 *   want to wait for one of the operations, omit `default` from the options
 *   struct.*
 *
 * @return {Promise<[T, Receiver<T>] | [true, Sender<T>] | [TDefault, undefined]>}
 *   If default is provided and no operation was ready, then the tuple
 *   `[default, undefined]` is returned.
 *
 *   If a `receive` operation is completed, then the tuple `[T, Receiver<T>]`
 *   is returned (where `T` is the value received, and `Receiver<T>` is the
 *   receiver channel that returned it).
 *
 *   If a `send` operation is completed, then the tuple `[true, Sender<T>]` is
 *   returned (where `Sender<T>` is the sender channel that we sent the value
 *   with).
 */
export async function select<T, TDefault = never>(
  ops: SelectOperation<T>[],
  options?:
    | SelectOptions<TDefault>
    | Omit<SelectOptions<TDefault>, "default">,
): Promise<SelectResult<T, TDefault>> {
  if (ops.length < 1) {
    throw new TypeError("cannot perform select on less than 1 operation");
  }
  const abortCtrl = options?.abortCtrl || new AbortController();
  const selectPromises: Promise<void | T | undefined>[] = ops.map((item) => {
    if (isReceiver(item)) {
      return item.receive(abortCtrl).then(([val]) => val);
    }
    return item[0].send(item[1], abortCtrl);
  });

  if (options && "default" in options) {
    sleep(0).then(() => abortCtrl.abort());
  }

  const results = await Promise.allSettled([...selectPromises]);

  for (let i = 0; i < results.length; i++) {
    const item = ops[i];
    const result = results[i];
    if (result.status === "rejected") continue;

    if (item instanceof Channel) {
      return [result.value as T, item];
    }

    if (Array.isArray(item)) {
      return [true, item[0]];
    }
  }

  if (options && "default" in options) {
    return [options.default, undefined];
  }

  throw new Error("Unreachable");
}
