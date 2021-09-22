import { Queue } from "./internal/queue.ts";
import {
  Closed,
  Idle,
  ReceiveStuck,
  SendStuck,
  State,
  Transition,
  WaitingForAck,
} from "./internal/state-machine.ts";
import { sleep } from "./internal/utils.ts";

export { InvalidTransitionError } from "./internal/state-machine.ts";

const eventType = (x: Transition | State): string => {
  return typeof x === "string" ? `Transition::${x}` : `State::${x.name}`;
};

class ValEvent<T> extends Event {
  constructor(type: string, readonly val?: T, eventInitDict?: EventInit) {
    super(type, eventInitDict);
  }
}

class TransitionEvent<T> extends ValEvent<T> {
  constructor(readonly t: Transition, val?: T, eventInitDict?: EventInit) {
    super(eventType(t), val, eventInitDict);
  }
}

class StateEvent<T> extends ValEvent<T> {
  constructor(readonly state: State, val?: T, eventInitDict?: EventInit) {
    super(eventType(state), val, eventInitDict);
  }
}

/**
 * Extra options for new channels.
 */
export interface ChannelOptions {
  /**
   * @type {boolean}
   * When true, debugging messages will be printed (using `console.debug`) in the lifecycle of the channel.
   */
  debug?: boolean;

  /**
   * @type {Record<string, unknown>}
   * When `debug` is `true`, this struct will be added to the debug messages.
   */
  debugExtra?: Record<string, unknown>;
}

/**
 * Options for pipe operations.
 *
 * @see Channel.map
 * @see Channel.flatMap
 * @see Channel.foreach
 * @see Channel.filter
 * @see Channel.reduce
 */
export interface ChannelPipeOptions extends ChannelOptions {
  /**
   * If provided, the pipe operation will halt when the signal is triggered.
   *
   * @type {AbortSignal}
   */
  signal?: AbortSignal;
}

export interface Closer {
  /**
   * Closes the channel.
   *
   * Closing a closed channel have no effect (positive or negative).
   *
   * Sending a message to a closed channel will throw an `AbortedError`.
   *
   * Receiving a message from a closed channel will resolve the promise immediately.
   * See `Channel.receive` for more information.
   */
  close(): void;
}

/**
 * @template T The type of value that can be sent.
 */
export interface Sender<T> {
  /**
   * Sends a value on the channel, and returns a promise that will be resolved when a the value is received (see
   * `Channel.receive`), or rejected if a provided `AbortController` is aborted.
   *
   * If the channel is closed, then the promise will be rejected with an `InvalidTransitionError`.
   *
   * ```ts
   * import {Channel, InvalidTransitionError} from "./channel.ts"
   *
   * const ch = new Channel()
   * ch.close();
   * try {
   *   await ch.send("should fail")
   *   console.assert(false, "unreachable")
   * } catch (e) {
   *   console.assert(e instanceof InvalidTransitionError)
   * }
   * ```
   *
   * @param {T} val
   *   The value to pass to the channel.
   * @param {AbortController} [abortCtrl]
   *   When provided `send` will `abort` the controller after `val` is successfully received.
   *   But if the controller is aborted before that, the promise returned by `send` will be rejected.
   * @returns {Promise<void>}
   *   will be resolved when message was passed, or rejected if `abortCtrl` was aborted or the channel is closed.
   */
  send(val: T, abortCtrl?: AbortController): Promise<void>;
}

/**
 * @template T The type of value that can be received.
 */
export interface Receiver<T> extends AsyncIterable<T> {
  /**
   * Receive returns a promise that will be resolved with `[T, true]` when a value is available, or rejected if a
   * provided `AbortController` is aborted
   *
   * If the channel is closed, then the promise will be resolved immediately with `[undefined, false]`.
   *
   * Receiving from a closed channel:
   * ```ts
   *   import {Channel} from "./channel.ts";
   *   const ch = new Channel();
   *   ch.close();
   *   const [val, ok] = await ch.receive()
   *   console.assert(val === undefined)
   *   console.assert(ok === false)
   * ```
   *
   * Receiving from a buffered channel:
   * ```ts
   *   import {Channel} from "./channel.ts";
   *   const ch = new Channel(1);
   *   await ch.send("Hello world!")
   *   ch.close();
   *   const [val, ok] = await ch.receive()
   *   console.assert(val === "Hello world!")
   *   console.assert(ok === true)
   * ```
   *
   * Aborting a receive request:
   * ```ts
   *   import {Channel, AbortedError} from "./channel.ts";
   *   const ch = new Channel(1);
   *   await ch.send("Hello world!")
   *   ch.close();
   *   const abortCtrl = new AbortController()
   *   abortCtrl.abort()
   *   try {
   *     await ch.receive(abortCtrl);
   *     console.assert(false, "unreachable");
   *   } catch (e) {
   *     console.assert(e instanceof AbortedError);
   *   }
   * ```
   *
   * @param {AbortController} [abortCtrl]
   *   When provided `receive` will `abort` the controller when a value is available.
   *   But if the controller is aborted before that, the promise returned by `receive` will be rejected.
   * @returns {Promise<[T, true] | [undefined, false]>}
   *   will be resolved when message was passed, or rejected if `abortCtrl` was aborted or the channel is closed.
   */
  receive(abortCtrl?: AbortController): Promise<[T, true] | [undefined, false]>;

  /**
   * Creates an `AsyncGenerator` that yields all values sent to this channel,
   * and returns when the channel closes.
   */
  [Symbol.asyncIterator](): AsyncGenerator<T, void, void>;

  /**
   * map returns a receiver channel that contains the results of applying `fn`
   * to each value of `this` channel.
   *
   * The receiver channel will close, when the original channel closes (or if
   * the provided signal is triggered).
   *
   * @template TOut
   * @param {(val: T) => TOut} fn
   * @return {Receiver<TOut>}
   */
  map<TOut>(
    fn: (val: T) => TOut | Promise<TOut>,
    bufferSize?: number,
    options?: ChannelPipeOptions,
  ): Receiver<TOut>;

  /**
   * flatMap returns a receiver channel that contains the flattened (1 level)
   * results of applying `fn` to each value of `this` channel.
   *
   * The receiver channel will close, when the original channel closes (or if
   * the provided signal is triggered).
   *
   * @template TOut
   * @param {(val: T) => Iterable<TOut> | AsyncIterable<TOut>} fn
   * @param {number} [bufferSize]
   * @param {ChannelPipeOptions} [options]
   */
  flatMap<TOut>(
    fn: (val: T) => Iterable<TOut> | AsyncIterable<TOut>,
    bufferSize?: number,
    options?: ChannelPipeOptions,
  ): Receiver<TOut>;

  /**
   * flat returns a receiver channel that contains the flattened (1 level)
   * values of each value of `this` channel.
   *
   * The receiver channel will close, when the original channel closes (or if
   * the provided signal is triggered).
   *
   * @param {number} [bufferSize]
   * @param {ChannelPipeOptions} [options]
   */
  flat<K>(
    this: Channel<Iterable<K> | AsyncIterable<K>>,
    bufferSize?: number,
    options?: ChannelPipeOptions,
  ): Receiver<K>;

  /**
   * forEach applies `fn` to each value in `this` channel, and returns a channel
   * that will close after `this` channel closes (or if
   * the provided signal is triggered).
   *
   * @param {(val: T) => void} fn
   * @return {Receiver<void>}
   */
  forEach(
    fn: (val: T) => void | Promise<void>,
    bufferSize?: number,
    options?: ChannelPipeOptions,
  ): Receiver<void>;

  filter(
    fn: (val: T) => boolean | Promise<boolean>,
    bufferSize?: number,
    options?: ChannelPipeOptions,
  ): Receiver<T>;

  reduce(
    fn: (prev: T, current: T) => T | Promise<T>,
    bufferSize?: number,
    options?: ChannelPipeOptions,
  ): Receiver<T>;
}

export type SendCloser<T> = Sender<T> & Closer;
export type ReceiveClose<T> = Receiver<T> & Closer;
export type SendReceiver<T> = Sender<T> & Receiver<T>;

/**
 * @template T The type of value held by this channel.
 */
export class Channel<T>
  implements Sender<T>, Receiver<T>, Closer, AsyncIterable<T> {
  protected currentVal?: T;
  protected current: State = Idle;
  protected transitionEventTarget = new EventTarget();
  protected stateEventTarget = new EventTarget();
  protected readonly queue: Queue<T>;

  /**
   * Constructs a new Channel with an optional buffer.
   *
   * @param {number} [bufferSize=0] A safe and positive integer representing the channel buffer size.
   *   A `bufferSize` of `0` indicates a channel without any buffer.
   * @param {ChannelOptions} [options]
   */
  constructor(
    bufferSize = 0,
    protected readonly options?: ChannelOptions,
  ) {
    if (!Number.isSafeInteger(bufferSize) || bufferSize < 0) {
      throw new TypeError("bufferSize must be a safe positive integer.");
    }
    this.queue = new Queue<T>(bufferSize);
    if (options?.debug) {
      const reporter = (ev: Event) => {
        this.debug(ev.type, { val: (ev as ValEvent<T>).val });
      };
      Object.values(Transition).forEach((t) => {
        this.transitionEventTarget.addEventListener(eventType(t), reporter);
      });

      [Idle, ReceiveStuck, SendStuck, WaitingForAck].forEach((state) => {
        this.stateEventTarget.addEventListener(eventType(state), reporter);
      });
    }
  }

  public close() {
    this.updateState(Transition.CLOSE);
  }

  public async receive(
    abortCtrl?: AbortController,
  ): Promise<[T, true] | [undefined, false]> {
    this.debug("receive()");
    const abortPromise = abortCtrl && makeAbortPromise(abortCtrl);

    if ([ReceiveStuck, WaitingForAck].includes(this.current)) {
      await (abortPromise
        ? Promise.race([
          this.waitForState(Idle, Closed),
          abortPromise,
        ])
        : this.waitForState(Idle, Closed));
    }

    if (abortCtrl?.signal.aborted) {
      this.debug("receive() aborted");
      throw new AbortedError("receive");
    }

    if ([Idle, Closed].includes(this.current) && !this.queue.isEmpty) {
      abortCtrl?.abort();
      return [this.queue.remove(), true];
    }

    if (this.current === Closed) {
      abortCtrl?.abort();
      return [undefined, false];
    }

    // Register to the WaitingForAck event before transitioning to guarantee order.
    const waitForAckPromise = this.waitForState(WaitingForAck, Closed);

    this.updateState(Transition.RECEIVE);
    const val =
      await (abortPromise
        ? Promise.race([waitForAckPromise, abortPromise])
        : waitForAckPromise);

    if (abortCtrl?.signal.aborted) {
      this.debug("receive() aborted");
      throw new AbortedError("receive");
    }

    if (this.current === Closed) {
      abortCtrl?.abort();
      return [undefined, false];
    }

    abortCtrl?.abort();
    this.updateState(Transition.ACK);

    if (this.queue.isEmpty) return [val as T, true];

    const valToReturn = this.queue.remove();
    this.queue.add(val as T);
    return [valToReturn, true];
  }

  public async send(val: T, abortCtrl?: AbortController): Promise<void> {
    this.debug("send(val)", { val });
    const abortPromise = abortCtrl && makeAbortPromise(abortCtrl);

    // If the channel state is stuck in another send, wait for the state to
    // change into Idle and try again.
    if ([SendStuck, WaitingForAck].includes(this.current)) {
      await (abortPromise
        ? Promise.race([this.waitForState(Idle), abortPromise])
        : this.waitForState(Idle));

      if (abortCtrl?.signal.aborted) {
        this.debug("send(val) aborted", { val });
        throw new AbortedError("send");
      }
      if (this.current !== Idle) return this.send(val);
    }

    if (abortCtrl?.signal.aborted) {
      this.debug("send(val) aborted", { val });
      throw new AbortedError("send");
    }

    if (this.current === Idle && !this.queue.isFull) {
      abortCtrl?.abort();
      this.queue.add(val);
      return;
    }

    // Register to the ReceiveStuck event before transitioning to guarantee order.
    const receiveStuckPromise = this.current === ReceiveStuck
      ? Promise.resolve()
      : this.waitForState(ReceiveStuck);

    this.updateState(Transition.SEND, val);
    if (this.current === Idle) {
      abortCtrl?.abort();
      return;
    }

    // Register to the Idle event before transitioning to guarantee order.
    const waitForIdlePromise = this.waitForState(Idle);
    await (abortPromise
      ? Promise.race([receiveStuckPromise, abortPromise])
      : receiveStuckPromise);

    if (abortCtrl?.signal.aborted) {
      this.debug("send(val) aborted", { val });
      throw new AbortedError("send");
    }
    abortCtrl?.abort();

    if (this.current === ReceiveStuck) {
      this.updateState(Transition.SEND, val);
    }

    await waitForIdlePromise;
  }

  public async *[Symbol.asyncIterator](): AsyncGenerator<T, void, void> {
    while (true) {
      const res = await this.receive();
      if (!res[1]) return;
      yield res[0];
    }
  }

  map<TOut>(
    fn: (val: T) => TOut | Promise<TOut>,
    bufferSize = this.queue.capacity,
    options: ChannelPipeOptions | undefined = this.options,
  ): Receiver<TOut> {
    const outChan = new Channel<TOut>(bufferSize, options);
    (async () => {
      while (true) {
        const ctrl = new AbortController();
        options?.signal?.addEventListener("abort", () => ctrl.abort());
        try {
          const res = await this.receive(ctrl);
          if (!res[1]) return;
          await outChan.send(await fn(res[0]));
        } catch (e) {
          if (e instanceof AbortedError) return;
          throw e;
        }
      }
    })().catch((err) => this.error("map", fn, err))
      .finally(() => outChan.close());
    return outChan;
  }

  flatMap<TOut>(
    fn: (val: T) => Iterable<TOut> | AsyncIterable<TOut>,
    bufferSize = this.queue.capacity,
    options: ChannelPipeOptions | undefined = this.options,
  ): Receiver<TOut> {
    const outChan = new Channel<TOut>(bufferSize, options);
    (async () => {
      while (true) {
        const ctrl = new AbortController();
        options?.signal?.addEventListener("abort", () => ctrl.abort());
        try {
          const res = await this.receive(ctrl);
          if (!res[1]) return;
          for await (const item of await fn(res[0])) {
            await outChan.send(item);
          }
        } catch (e) {
          if (e instanceof AbortedError) return;
          throw e;
        }
      }
    })().catch((err) => this.error("flatMap", fn, err))
      .finally(() => outChan.close());
    return outChan;
  }

  flat<K>(
    this: Channel<Iterable<K> | AsyncIterable<K>>,
    bufferSize?: number,
    options: ChannelPipeOptions | undefined = this.options,
  ): Receiver<K> {
    const outChan = new Channel<K>(bufferSize, options);
    (async () => {
      while (true) {
        const ctrl = new AbortController();
        options?.signal?.addEventListener("abort", () => ctrl.abort());
        try {
          const res = await this.receive();
          if (!res[1]) return;

          for await (const item of res[0]) {
            await outChan.send(item);
          }
        } catch (e) {
          if (e instanceof AbortedError) return;
          throw e;
        }
      }
    })().catch((err) => this.error("flat", err))
      .finally(() => outChan.close());

    return outChan;
  }

  forEach(
    fn: (val: T) => void | Promise<void>,
    bufferSize = this.queue.capacity,
    options: ChannelPipeOptions | undefined = this.options,
  ): Receiver<void> {
    const outChan = new Channel<void>(bufferSize, options);
    (async () => {
      while (true) {
        const ctrl = new AbortController();
        options?.signal?.addEventListener("abort", () => ctrl.abort());
        try {
          const res = await this.receive(ctrl);
          if (!res[1]) return;
          await fn(res[0]);
        } catch (e) {
          if (e instanceof AbortedError) return;
          throw e;
        }
      }
    })().catch((err) => this.error("map", fn, err))
      .finally(() => outChan.close());
    return outChan;
  }

  filter(
    fn: (val: T) => boolean | Promise<boolean>,
    bufferSize = this.queue.capacity,
    options: ChannelPipeOptions | undefined = this.options,
  ): Receiver<T> {
    const outChan = new Channel<T>(bufferSize, options);
    (async () => {
      while (true) {
        const ctrl = new AbortController();
        options?.signal?.addEventListener("abort", () => ctrl.abort());
        try {
          const res = await this.receive(ctrl);
          if (!res[1]) return;
          if (!(await fn(res[0]))) continue;
          await outChan.send(res[0]);
        } catch (e) {
          if (e instanceof AbortedError) return;
          throw e;
        }
      }
    })().catch((err) => this.error("map", fn, err))
      .finally(() => outChan.close());
    return outChan;
  }

  reduce(
    fn: (prev: T, current: T) => T | Promise<T>,
    bufferSize = this.queue.capacity,
    options: ChannelPipeOptions | undefined = this.options,
  ): Receiver<T> {
    const outChan = new Channel<T>(bufferSize, options);
    this.debug("reduce(fn)", { fn });

    (async () => {
      const makeAbortCtrl = () => {
        if (!options?.signal) return;
        const ctrl = new AbortController();
        options.signal.addEventListener("abort", () => ctrl.abort());
        return ctrl;
      };

      let prev: T;

      const res = await this.receive(makeAbortCtrl());
      if (!res[1]) return;
      prev = res[0];

      while (true) {
        const res = await this.receive(makeAbortCtrl());
        if (!res[1]) {
          return await outChan.send(prev);
        }
        prev = await fn(prev, res[0]);
      }
    })().catch((err) => this.error("reduce", fn, err))
      .finally(() => outChan.close());

    return outChan;
  }

  static from<T>(
    input: Iterable<T> | AsyncIterable<T>,
    bufferSize?: number,
    options?: ChannelOptions,
  ): Receiver<T> {
    const outChan = new Channel<T>(bufferSize, options);

    (async () => {
      for await (const item of input) {
        await outChan.send(item);
      }
    })();

    return outChan;
  }

  /**
   * @throws {InvalidTransitionError}
   */
  protected updateState(t: Transition, val?: T): void {
    this.debug(`updateState(${t}, ${val})`);
    this.currentVal = val;
    this.current = this.current(t);
    this.transitionEventTarget.dispatchEvent(
      new TransitionEvent(t, val),
    );
    this.stateEventTarget.dispatchEvent(
      new StateEvent(this.current, val),
    );
  }

  protected waitForState(...states: State[]): Promise<T | undefined> {
    this.debug(`waitForState(${states.map((s) => s.name).join(", ")})`);
    if (states.includes(this.current)) {
      return Promise.resolve<T | undefined>(this.currentVal);
    }
    return new Promise<T | undefined>((resolve) => {
      states.forEach((state) => {
        this.stateEventTarget.addEventListener(eventType(state), (ev) => {
          // Resolve the promise in a scheduled-task, so the code that waits for
          // it won't run in the current (or upcoming) micro-task.
          scheduleTask(() => {
            resolve((ev as ValEvent<T>).val);
          });
        }, { once: true });
      });
    });
  }

  protected error(...args: unknown[]) {
    console.error(...args, {
      currentState: this.current.name,
      currentVal: this.currentVal,
      ...(this.options?.debugExtra || {}),
    });
  }

  protected debug(...args: unknown[]) {
    if (this.options?.debug) {
      console.debug(...args, {
        currentState: this.current.name,
        currentVal: this.currentVal,
        ...(this.options?.debugExtra || {}),
      });
    }
  }
}

// Rename `setTimeout` to `scheduleTask` to explicitly state the usage.
const scheduleTask = setTimeout;

function makeAbortPromise(abortCtrl: AbortController) {
  if (abortCtrl.signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    abortCtrl.signal.addEventListener("abort", () => resolve());
  });
}

/**
 * The `Error` class used when `receive` or `send` are aborted before
 * completion.
 */
export class AbortedError extends Error {
  constructor(type: "send" | "receive") {
    super(`${type} aborted`);
  }
}

/**
 * Extra options used for the `select` function.
 */
export interface SelectOptions<TDefault = never> {
  default: TDefault;
  abortCtrl?: AbortController;
}

type SelectOperation<T> = Receiver<T> | [Sender<T>, T];
type SelectDefaultResult<T> = [T, undefined];
type SelectOperationResult<T> = [T, Receiver<T>] | [true, Sender<T>];
type SelectResult<T, TDefault> =
  | SelectOperationResult<T>
  | SelectDefaultResult<TDefault>;

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

function isReceiver(x: unknown): x is Receiver<unknown> {
  return x instanceof Object && "receive" in x &&
    typeof x["receive"] === "function";
}

export type MergeOptions = ChannelOptions & { bufferSize?: number };
export function merge(
  inChans: [],
  options?: MergeOptions,
): never;
export function merge(
  inChans: [Receiver<unknown>],
  options?: MergeOptions,
): never;
export function merge<T1, T2>(
  inChans: [
    Receiver<T1>,
    Receiver<T2>,
  ],
  options?: MergeOptions,
): Receiver<T1 | T2>;
export function merge<T1, T2, T3>(
  inChans: [
    Receiver<T1>,
    Receiver<T2>,
    Receiver<T3>,
  ],
  options?: MergeOptions,
): Receiver<T1 | T2 | T3>;
/**
 * Takes a collection of source channels and returns a channel
 * which contains all values taken from them.
 *
 * @template T
 * @param {Receiver<T>[]} inChans
 * @param {MergeOptions} [options={}]
 * @returns {Receiver<T>}
 */
export function merge<T>(
  inChans: Receiver<T>[],
  options: MergeOptions = {},
): Receiver<T> {
  if (inChans.length < 2) {
    throw new TypeError("cannot merge less than 2 channels");
  }
  const { bufferSize, ...chOpts } = options;
  const outChan = new Channel<T>(bufferSize, chOpts);

  Promise.all(inChans.map((inChan) =>
    (async () => {
      for await (const current of inChan) {
        await outChan.send(current);
      }
    })()
  )).catch((err) => console.error("merge", err))
    .finally(() => outChan.close());

  return outChan;
}
