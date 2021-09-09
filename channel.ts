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

export interface ChannelOptions {
  debug?: boolean;
  debugExtra?: Record<string, unknown>;
}

export interface Closer {
  close(): void;
}

export interface Sender<T> {
  send(val: T, abortCtrl?: AbortController): Promise<void>;
}

export interface Receiver<T> extends AsyncIterable<T> {
  receive(abortCtrl?: AbortController): Promise<[T, true] | [undefined, false]>;
  map<TOut>(fn: (val: T) => TOut): Receiver<TOut>;
  forEach(fn: (val: T) => void): Receiver<void>;
  filter(fn: (val: T) => boolean): Receiver<T>;
  reduce(fn: (prev: T, current: T) => T): Receiver<T>;
}

export type SendCloser<T> = Sender<T> & Closer;
export type ReceiveClose<T> = Receiver<T> & Closer;
export type SendReceiver<T> = Sender<T> & Receiver<T>;

export class Channel<T>
  implements Sender<T>, Receiver<T>, Closer, AsyncIterable<T> {
  protected currentVal?: T;
  protected current: State = Idle;
  protected transitionEventTarget = new EventTarget();
  protected stateEventTarget = new EventTarget();
  protected readonly queue: Queue<T>;

  constructor(
    bufferSize = 0,
    protected readonly options?: ChannelOptions,
  ) {
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
  map<TOut>(fn: (val: T) => TOut): Receiver<TOut> {
    const outChan = new Channel<TOut>();
    (async () => {
      for await (const current of this) {
        await outChan.send(fn(current));
      }
    })().catch((err) => this.error("map", fn, err))
      .finally(() => outChan.close());
    return outChan;
  }
  forEach(fn: (val: T) => void): Receiver<void> {
    const outChan = new Channel<void>();
    (async () => {
      for await (const current of this) {
        fn(current);
      }
    })().catch((err) => this.error("map", fn, err))
      .finally(() => outChan.close());
    return outChan;
  }
  filter(fn: (val: T) => boolean): Receiver<T> {
    const outChan = new Channel<T>();
    (async () => {
      for await (const current of this) {
        if (!fn(current)) continue;
        await outChan.send(current);
      }
    })().catch((err) => this.error("map", fn, err))
      .finally(() => outChan.close());
    return outChan;
  }
  reduce(fn: (prev: T, current: T) => T): Receiver<T> {
    const outChan = new Channel<T>();

    (async () => {
      const res = await this.receive();
      if (!res[1]) return;

      let prev = res[0];
      for await (const current of this) {
        prev = fn(prev, current);
      }

      await outChan.send(prev);
    })().catch((err) => this.error("reduce", fn, err))
      .finally(() => outChan.close());

    return outChan;
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
          scheduleTask(() => {
            resolve((ev as ValEvent<T>).val);
          });
        }, { once: true });
      });
    });
  }

  protected waitForTransition(t: Transition): Promise<T | undefined> {
    this.debug("waitForTransition", t);
    return new Promise<T | undefined>((resolve) => {
      this.transitionEventTarget.addEventListener(eventType(t), (ev) => {
        scheduleTask(() => resolve((ev as ValEvent<T>).val));
      }, { once: true });
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

const scheduleTask = setTimeout;

export function makeAbortPromise(abortCtrl: AbortController) {
  if (abortCtrl.signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    abortCtrl.signal.addEventListener("abort", () => resolve());
  });
}

export class AbortedError extends Error {
  constructor(type: "send" | "receive") {
    super(`${type} aborted`);
  }
}

export interface SelectOptions<T> {
  default: T;
}

export function isReceiver(x: unknown): x is Receiver<unknown> {
  return x instanceof Object && "receive" in x &&
    typeof x["receive"] === "function";
}

export function isSender(x: unknown): x is Sender<unknown> {
  return x instanceof Object && "send" in x &&
    typeof x["send"] === "function";
}

export async function select<T>(
  items: (Receiver<T> | [Sender<T>, T])[],
  options?: SelectOptions<T> | Exclude<SelectOptions<T>, "default">,
): Promise<[T, Receiver<T>] | [true, Sender<T>] | [unknown, undefined]> {
  const abortCtrl = new AbortController();
  const selectPromises: Promise<void | T | undefined>[] = items.map((item) => {
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
    const item = items[i];
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

export function merge(): never;
export function merge(inChans: Receiver<unknown>): never;
export function merge<T1, T2>(
  inChan1: Receiver<T1>,
  inChan2: Receiver<T2>,
): Receiver<T1 | T2>;
export function merge<T1, T2, T3>(
  inChan1: Receiver<T1>,
  inChan2: Receiver<T2>,
  inChan3: Receiver<T3>,
): Receiver<T1 | T2 | T3>;
export function merge<T1, T2, T3, T4>(
  inChan1: Receiver<T1>,
  inChan2: Receiver<T2>,
  inChan3: Receiver<T3>,
  inChan4: Receiver<T4>,
): Receiver<T1 | T2 | T3 | T4>;
export function merge<T1, T2, T3, T4, T5>(
  inChan1: Receiver<T1>,
  inChan2: Receiver<T2>,
  inChan3: Receiver<T3>,
  inChan4: Receiver<T4>,
  inChan5: Receiver<T5>,
): Receiver<T1 | T2 | T3 | T4 | T5>;
export function merge<T>(...inChans: Receiver<T>[]): Receiver<T>;
export function merge<T>(...inChans: Receiver<T>[]): Receiver<T> {
  if (inChans.length < 2) {
    throw new TypeError("cannot merge less than 2 channels");
  }
  const outChan = new Channel<T>();

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
