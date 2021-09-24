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
import {
  ignoreAbortedError,
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
  makeAbortCtrl,
  recordWithDefaults,
} from "./internal/utils.ts";

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

export type ChannelDuplicateSendMode =
  | "WaitForAll"
  | "WaitForOne"
  | "ContinueImmediately";

export interface ChannelDuplicateOptions extends ChannelPipeOptions {
  sendMode: ChannelDuplicateSendMode;
}

export type Closer = Pick<Channel<unknown>, "close" | "with">;

/**
 * @template T The type of value that can be sent.
 */
export type Sender<T> = Pick<Channel<T>, "send" | "with">;

/**
 * @template T The type of value that can be received.
 */
export type Receiver<T> = Omit<Channel<T>, "send">;

export interface ClosedReceiver extends Receiver<unknown> {
  receive(abortCtrl?: AbortController): Promise<[undefined, false]>;
}

/**
 * @template T The type of value that can be sent to or received by this channel.
 */
export class Channel<T> implements AsyncIterable<T> {
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
    if (!isNonNegativeSafeInteger(bufferSize)) {
      throw new TypeError("bufferSize must be a safe non-negative integer.");
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
  public close() {
    this.updateState(Transition.CLOSE);
  }

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

  /**
   * Creates an `AsyncGenerator` that yields all values sent to this channel,
   * and returns when the channel closes.
   */
  public async *[Symbol.asyncIterator](): AsyncGenerator<T, void, void> {
    while (true) {
      const res = await this.receive();
      if (!res[1]) return;
      yield res[0];
    }
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
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<TOut>(
      bufferSize ?? this.queue.capacity,
      options,
    );
    (async () => {
      while (true) {
        const res = await this.receive(makeAbortCtrl(signal));
        if (!res[1]) return;
        await outChan.send(await fn(res[0]), makeAbortCtrl(signal));
      }
    })().catch(ignoreAbortedError)
      .catch((err) => this.error("map", fn, err))
      .finally(() => outChan.close());
    return outChan;
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
    fn: (val: T) => Iterable<TOut> | AsyncIterable<TOut>,
    pipeOpts?: ChannelPipeOptions,
  ): Receiver<TOut> {
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<TOut>(
      bufferSize ?? this.queue.capacity,
      options,
    );
    (async () => {
      while (true) {
        const res = await this.receive(makeAbortCtrl(signal));
        if (!res[1]) return;
        for await (const item of fn(res[0])) {
          await outChan.send(item, makeAbortCtrl(signal));
        }
      }
    })().catch(ignoreAbortedError)
      .catch((err) => this.error("flatMap", fn, err))
      .finally(() => outChan.close());
    return outChan;
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
    this: Channel<Iterable<K> | AsyncIterable<K>>,
    pipeOpts?: ChannelPipeOptions,
  ): Receiver<K> {
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<K>(bufferSize ?? this.queue.capacity, options);
    (async () => {
      while (true) {
        const res = await this.receive(makeAbortCtrl(signal));
        if (!res[1]) return;

        for await (const item of res[0]) {
          await outChan.send(item, makeAbortCtrl(signal));
        }
      }
    })().catch(ignoreAbortedError)
      .catch((err) => this.error("flat", err))
      .finally(() => outChan.close());

    return outChan;
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
    fn: (val: T) => void | Promise<void>,
    pipeOpts?: ChannelPipeOptions,
  ): Receiver<void> {
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<void>(
      bufferSize ?? this.queue.capacity,
      options,
    );
    (async () => {
      while (true) {
        const res = await this.receive(makeAbortCtrl(signal));
        if (!res[1]) return;
        await fn(res[0]);
      }
    })().catch(ignoreAbortedError)
      .catch((err) => this.error("forEach", fn, err))
      .finally(() => outChan.close());
    return outChan;
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
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<T>(bufferSize ?? this.queue.capacity, options);
    (async () => {
      while (true) {
        const res = await this.receive(makeAbortCtrl(signal));
        if (!res[1]) return;
        if (!(await fn(res[0]))) continue;
        await outChan.send(res[0], makeAbortCtrl(signal));
      }
    })().catch(ignoreAbortedError)
      .catch((err) => this.error("filter", fn, err))
      .finally(() => outChan.close());
    return outChan;
  }

  reduce(
    fn: (prev: T, current: T) => T | Promise<T>,
    pipeOpts?: ChannelPipeOptions,
  ): Receiver<T> {
    const { signal, bufferSize, ...options } = pipeOpts ?? {};
    const outChan = new Channel<T>(bufferSize ?? this.queue.capacity, options);

    (async () => {
      let prev: T;

      const res = await this.receive(makeAbortCtrl(signal));
      if (!res[1]) return;
      prev = res[0];

      while (true) {
        const res = await this.receive(makeAbortCtrl(signal));
        if (!res[1]) {
          return await outChan.send(prev, makeAbortCtrl(signal));
        }
        prev = await fn(prev, res[0]);
      }
    })().catch(ignoreAbortedError)
      .catch((err) => this.error("reduce", fn, err))
      .finally(() => outChan.close());

    return outChan;
  }

  groupBy<TKey extends (string | symbol)>(
    fn: (val: T) => TKey | Promise<TKey>,
    pipeOpts?: ChannelPipeOptions,
  ): Record<TKey, Receiver<T>> {
    const { signal, bufferSize, debugExtra, ...options } = pipeOpts ?? {};
    const out = recordWithDefaults(
      {} as Record<TKey, Channel<T>>,
      (prop) => {
        return new Channel<T>(bufferSize ?? this.queue.capacity, {
          ...options,
          debugExtra: { prop, ...debugExtra },
        });
      },
    );

    (async () => {
      while (true) {
        const res = await this.receive(makeAbortCtrl(signal));
        if (!res[1]) return;
        const key = await fn(res[0]);
        await out[key].send(res[0], makeAbortCtrl(signal));
      }
    })().catch(ignoreAbortedError)
      .catch((err) => this.error("groupBy", fn, err))
      .finally(() => {
        Object.values<Channel<T>>(out).forEach((ch) => ch.close());
      });

    return out;
  }

  /**
   * duplicate creates multiple channels (determined by `n`), and consumes `this` channel.
   * The consumed values are then sent to all channels
   * @param {number} [n=2] A safe interger larger than 1.
   * @param {number} [bufferSize]
   * @param {ChannelDuplicateOptions} [pipeOpts]
   * @returns {Channel<T>[]}
   * @throws {TypeError | RangeError}
   */
  duplicate(
    n = 2,
    pipeOpts?: ChannelDuplicateOptions,
  ): Channel<T>[] {
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
      arrOut[i] = new Channel(bufferSize ?? this.queue.capacity, {
        ...options,
        debugExtra: { i, ...debugExtra },
      });
    }

    (async () => {
      while (true) {
        const res = await this.receive(makeAbortCtrl(signal));
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
              .catch((err) => this.error("duplicate", n, err));
            break;
        }
      }
    })().catch(ignoreAbortedError)
      .catch((err) => this.error("duplicate", n, err))
      .finally(() => arrOut.forEach((ch) => ch.close()));

    return arrOut;
  }

  with<T>(fn: (t: typeof this) => T): T {
    return fn(this);
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
      ...(this.options?.debugExtra ?? {}),
    });
  }

  protected debug(...args: unknown[]) {
    if (this.options?.debug) {
      console.debug(...args, {
        currentState: this.current.name,
        currentVal: this.currentVal,
        ...(this.options?.debugExtra ?? {}),
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

export function isReceiver(x: unknown): x is Receiver<unknown> {
  return x instanceof Object && "receive" in x &&
    typeof x["receive"] === "function";
}
