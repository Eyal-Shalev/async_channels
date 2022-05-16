import { AbortedError } from "./internal/errors.ts";
import { Queue } from "./internal/queue.ts";
import {
  Idle,
  InvalidTransitionError,
  isClosed,
  isGetStuck,
  isIdle,
  isSendStuck,
  SendOnClosedError,
  State,
} from "./internal/state_machine.ts";
import {
  ignoreAbortedError,
  isNonNegativeSafeInteger,
  makeAbortCtrl,
  raceAbort,
} from "./internal/utils.ts";
import {
  ChannelDuplicateOptions,
  ChannelPipeOptions,
  duplicate,
  filter,
  flat,
  flatMap,
  forEach,
  groupBy,
  map,
  reduce,
  subscribe,
  SubscribeOptions,
  SubscribeReturnType,
} from "./pipe.ts";

export { UnreachableError } from "./internal/errors.ts";
export { AbortedError, InvalidTransitionError, SendOnClosedError };

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

  /**
   * Provide a custom logger - defaults to `console`
   */
  logger?: Console;
}

export type Closer = Pick<Channel<unknown>, "close">;

/**
 * @template T The type of value that can be sent.
 */
export type Sender<T> = Pick<Channel<T>, "send">;

/**
 * @template T The type of value that can be received.
 */
export type Receiver<T> = Omit<Channel<T>, "close" | "send">;

export interface ClosedReceiver extends Receiver<unknown> {
  get(abortCtrl?: AbortController): Promise<[undefined, false]>;
}

/**
 * @template T The type of value that can be sent to or received by this channel.
 */
export class Channel<T>
  implements AsyncIterable<T>, AsyncIterator<T, void, void> {
  #queue: Queue<T>;
  #state: State<T>;
  #logger: Console;

  /**
   * Constructs a new Channel with an optional buffer.
   *
   * @param {number} [bufferSize=0] A safe and positive integer representing the channel buffer size.
   *   A `bufferSize` of `0` indicates a channel without any buffer.
   * @param {ChannelOptions} [options]
   */
  constructor(
    readonly bufferSize: number = 0,
    protected readonly options?: ChannelOptions,
  ) {
    if (!isNonNegativeSafeInteger(bufferSize)) {
      throw new RangeError("bufferSize must be a safe non-negative integer.");
    }
    this.#state = Idle(this.debug.bind(this));
    this.#queue = new Queue<T>(bufferSize);
    this.#logger = options?.logger ?? console;
  }

  /**
   * Sends a value on the channel, and returns a promise that will be resolved when a the value is received (see
   * `Channel.get`), or rejected if a provided `AbortController` is aborted.
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
  async send(val: T, abortCtrl?: AbortController): Promise<void> {
    this.debug("send(val)", { val });
    if (abortCtrl?.signal?.aborted) throw new AbortedError("send");
    if (isClosed(this.#state)) throw new SendOnClosedError();
    if (isSendStuck(this.#state)) {
      await raceAbort(this.#state.promise, "send", abortCtrl?.signal);
      return this.send(val, abortCtrl);
    }

    if (isIdle(this.#state) && !this.#queue.isFull) {
      abortCtrl?.abort();
      this.#queue.enqueue(val);
      return;
    }

    if (isGetStuck(this.#state)) {
      abortCtrl?.abort();
      this.#state = this.#state.send(val);
      return;
    }

    this.#state = this.#state.send(val);
    await raceAbort(this.#state.promise, "send", abortCtrl?.signal);
    abortCtrl?.abort();
  }

  /**
   * `get` returns a promise that will be resolved with `[T, true]` when a value is available, or rejected if a
   * provided `AbortController` is aborted.
   *
   * If the channel is closed, then the promise will be resolved immediately with `[undefined, false]`.
   *
   * Receiving from a closed channel:
   * ```ts
   *   import {Channel} from "./channel.ts";
   *   const ch = new Channel();
   *   ch.close();
   *   const [val, ok] = await ch.get()
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
   *   const [val, ok] = await ch.get()
   *   console.assert(val === "Hello world!")
   *   console.assert(ok === true)
   * ```
   *
   * Aborting a get request:
   * ```ts
   *   import {Channel, AbortedError} from "./channel.ts";
   *   const ch = new Channel(1);
   *   await ch.send("Hello world!")
   *   ch.close();
   *   const abortCtrl = new AbortController()
   *   abortCtrl.abort()
   *   try {
   *     await ch.get(abortCtrl);
   *     console.assert(false, "unreachable");
   *   } catch (e) {
   *     console.assert(e instanceof AbortedError);
   *   }
   * ```
   *
   * @param {AbortController} [abortCtrl]
   *   When provided `get` will `abort` the controller when a value is available.
   *   But if the controller is aborted before that, the promise returned by `get` will be rejected.
   * @returns {Promise<[T, true] | [undefined, false]>}
   *   will be resolved when message was passed, or rejected if `abortCtrl` was aborted or the channel is closed.
   */
  async get(
    abortCtrl?: AbortController,
  ): Promise<[T, true] | [undefined, false]> {
    this.debug("get()");
    if (abortCtrl?.signal?.aborted) throw new AbortedError("get");
    if (isGetStuck(this.#state)) {
      await raceAbort(this.#state.promise, "get", abortCtrl?.signal);
      return this.get(abortCtrl);
    }

    if (isSendStuck(this.#state)) {
      abortCtrl?.abort();
      const valP = this.#state.promise;
      this.#state = this.#state.get();
      const val = await valP;
      if (this.#queue.isEmpty) return [val, true];
      const valFromQueue = this.#queue.dequeue();
      this.#queue.enqueue(val);
      return [valFromQueue, true];
    }

    if (!this.#queue.isEmpty) {
      abortCtrl?.abort();
      return [this.#queue.dequeue(), true];
    }

    if (isClosed(this.#state)) {
      abortCtrl?.abort();
      return [undefined, false];
    }

    this.#state = this.#state.get();
    const res = await raceAbort(this.#state.promise, "get", abortCtrl?.signal);
    abortCtrl?.abort();
    return res;
  }

  /**
   * Closes the channel.
   *
   * Closing a closed channel have no effect (positive or negative).
   *
   * Sending a message to a closed channel will throw an `AbortedError`.
   *
   * Receiving a message from a closed channel will resolve the promise immediately.
   * See `Channel.get` for more information.
   */
  close() {
    this.#state = this.#state.close();
  }

  /**
   * Creates an `AsyncGenerator` that yields all values sent to this channel,
   * and returns when the channel closes.
   */
  public async *[Symbol.asyncIterator](): AsyncGenerator<T, void, void> {
    while (true) {
      const res = await this.get();
      if (!res[1]) return;
      yield res[0];
    }
  }

  /**
   * Blocks until a value is available on the channel, or returns immedietly if the channel is closed.
   */
  public async next(): Promise<IteratorResult<T, void>> {
    const [value, ok] = await this.get();
    if (!ok) return { done: true, value: void 0 };
    return { value, done: false };
  }

  /**
   * Closes the channel, and returns an empty result.
   */
  public return() {
    this.close();
    return this.next();
  }

  /**
   * Logs the error, closes the channel, and returns an empty result.
   */
  public throw(e?: unknown) {
    this.error(e);
    return this.return();
  }

  /**
   * Applies `fn` on `this` and returns the result.
   *
   * @example
   * ```ts
   * import { Channel } from "./channel.ts";
   * import { map } from "./pipe.ts";
   * const srcCh = new Channel<number>(1);
   * const resCh = srcCh.with(map(n => n * 2));
   * await srcCh.send(5);
   * srcCh.close();
   * console.assert(await resCh.get() === [10, true]);
   * ```
   *
   * @param {(ch: typeof this) => TOut} fn
   * @returns {TOut}
   */
  with<TOut, TThis extends Receiver<T>>(
    this: TThis,
    fn: (t: TThis) => TOut,
  ): TOut {
    return fn(this);
  }

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
    pipeOpts?: ChannelPipeOptions,
  ): Receiver<TOut> {
    return this.with(map(fn, pipeOpts));
  }

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
    fn: (
      val: T,
    ) =>
      | Iterable<TOut>
      | AsyncIterable<TOut>
      | Promise<Iterable<TOut>>
      | Promise<AsyncIterable<TOut>>,
    pipeOpts?: ChannelPipeOptions,
  ): Receiver<TOut> {
    return this.with(flatMap(fn, pipeOpts));
  }

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
    this: Receiver<Iterable<K> | AsyncIterable<K>>,
    pipeOpts?: ChannelPipeOptions,
  ): Receiver<K> {
    return this.with(flat(pipeOpts));
  }

  /**
   * forEach applies `fn` to each value in `this` channel, and returns a channel
   * that will contain the results.
   * The returned channel will close after `this` channel closes (or if
   * the provided signal is triggered).
   *
   * @param {(val: T) => void} fn
   * @return {Receiver<void>}
   */
  forEach(
    fn: (val: T) => unknown | Promise<unknown>,
    pipeOpts?: ChannelPipeOptions,
  ): Receiver<void> {
    return this.with(forEach(fn, pipeOpts));
  }

  /**
   * filter applies `fn` to each value in `this` channel, and returns a new channel
   * that will only contain value for which `fn` returned `true` (or a promise that resolves to `true`).
   *
   * The returned channel will close after `this` channel closes (or if the provided signal is triggered).
   *
   * @param {(val: T) => boolean | Promise<boolean>} fn The filter function to use.
   * @param {number} [bufferSize]
   * @param {ChannelPipeOptions} pipeOpts
   * @returns {Receiver<T>}
   */
  filter(
    fn: (val: T) => boolean | Promise<boolean>,
    pipeOpts?: ChannelPipeOptions,
  ): Receiver<T> {
    return this.with(filter(fn, pipeOpts));
  }

  reduce(
    fn: (prev: T, current: T) => T | Promise<T>,
    pipeOpts?: ChannelPipeOptions,
  ): Receiver<T> {
    return this.with(reduce(fn, pipeOpts));
  }

  groupBy<TKey extends (string | symbol)>(
    fn: (val: T) => TKey | Promise<TKey>,
    pipeOpts?: ChannelPipeOptions,
  ): Record<TKey, Receiver<T>> {
    return this.with(groupBy(fn, pipeOpts));
  }

  /**
   * duplicate creates multiple channels (determined by `n`), and consumes `this` channel.
   * The consumed values are then sent to all channels
   * @param {number} [n=2] A safe interger larger than 1.
   * @param {number} [bufferSize]
   * @param {ChannelDuplicateOptions} [pipeOpts]
   * @returns {Receiver<T>[]}
   * @throws {TypeError | RangeError}
   */
  duplicate(n = 2, pipeOpts?: ChannelDuplicateOptions): Receiver<T>[] {
    return this.with(duplicate(n, pipeOpts));
  }

  subscribe<TObj>(
    fn: (_: T) => string | number | symbol,
    topics: (keyof TObj)[],
    options?: SubscribeOptions,
  ): SubscribeReturnType<T, TObj> {
    return this.with(subscribe(fn, topics, options));
  }

  static from<T>(
    input: Iterable<T> | AsyncIterable<T>,
    pipeOpts?: ChannelPipeOptions,
  ): Receiver<T> {
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<T>(bufferSize, options);

    (async () => {
      for await (const item of input) {
        await outChan.send(item, makeAbortCtrl(signal));
      }
    })().catch(ignoreAbortedError)
      .catch((err) => outChan.error("Channel.from", err))
      .finally(() => outChan.close());

    return outChan;
  }

  /**
   * @internal
   */
  error(...args: unknown[]): void {
    this.#logger.error(...args, {
      [Symbol.for("time")]: new Date(),
      [Symbol.for("state")]: this.#state.name,
      ...this.options?.debugExtra,
    });
  }

  /**
   * @internal
   */
  debug(...args: unknown[]): void {
    if (this.options?.debug) {
      this.#logger.debug(...args, {
        [Symbol.for("time")]: new Date(),
        [Symbol.for("state")]: this.#state.name,
        ...this.options?.debugExtra,
      });
    }
  }
}
