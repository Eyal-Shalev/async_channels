import { Queue } from "./internal/queue.ts";
import {
  Closed,
  Idle,
  RecieveStuck,
  SendStuck,
  State,
  Transition,
  WaitingForAck,
} from "./internal/state-machine.ts";

export interface ChannelOptions {
  debug?: boolean;
  debugExtra?: Record<string, unknown>;
}

export class Channel<T> {
  protected currentVal?: T;
  protected current: State = Idle;
  protected transitionEventTarget = new EventTarget();
  protected stateEventTarget = new EventTarget();
  protected readonly queue: Queue<T>;

  constructor(
    bufferSize: number,
    protected readonly options?: ChannelOptions,
  ) {
    this.queue = new Queue<T>(bufferSize);
    if (options?.debug) {
      console.log(); // Don't ask...
      const reporter = (prefix: string) => {
        return (ev: Event) => {
          this.debug(`${prefix}::${ev.type}`, {
            val: (ev as CustomEvent).detail,
          });
        };
      };
      Object.values(Transition).forEach((t) => {
        this.transitionEventTarget.addEventListener(t, reporter("Transition"));
      });

      [Idle, RecieveStuck, SendStuck, WaitingForAck].forEach((state) => {
        this.stateEventTarget.addEventListener(state.name, reporter("State"));
      });
    }
  }

  public close() {
    this.updateState(Transition.CLOSE);
  }

  public async recieve(
    abortCtrl?: AbortController,
  ): Promise<[T, true] | [undefined, false]> {
    this.debug("recieve()");
    const abortPromise = abortCtrl && makeAbortPromise(abortCtrl);

    if ([RecieveStuck, WaitingForAck].includes(this.current)) {
      await (abortPromise
        ? Promise.race([
          this.waitForState(Idle, Closed),
          abortPromise,
        ])
        : this.waitForState(Idle, Closed));
    }

    if (abortCtrl?.signal.aborted) throw new AbortedError("recieve");

    if ([Idle, Closed].includes(this.current) && !this.queue.isEmpty) {
      abortCtrl?.abort();
      return [this.queue.remove(), true];
    }

    if (this.current === Closed) {
      abortCtrl?.abort();
      return [undefined, false];
    }

    // Register to the WaitingForAck event before transitioning to guarantee order.
    const waitForAckPromise = this.waitForState(WaitingForAck);

    this.updateState(Transition.RECIEVE);
    const val =
      await (abortPromise
        ? Promise.race([waitForAckPromise, abortPromise])
        : waitForAckPromise);

    if (abortCtrl?.signal.aborted) throw new AbortedError("recieve");

    abortCtrl?.abort();
    this.updateState(Transition.ACK);

    if (this.queue.isEmpty) return [val as T, true];

    const valToReturn = this.queue.remove();
    this.queue.add(val as T);
    return [valToReturn, true];
  }

  public async send(val: T, abortCtrl?: AbortController): Promise<void> {
    this.debug(`send(${val})`);
    const abortPromise = abortCtrl && makeAbortPromise(abortCtrl);

    if ([SendStuck, WaitingForAck].includes(this.current)) {
      await (abortPromise
        ? Promise.race([this.waitForState(Idle)])
        : this.waitForState(Idle));
    }

    if (abortCtrl?.signal.aborted) throw new AbortedError("send");

    if (this.current === Idle && !this.queue.isFull) {
      abortCtrl?.abort();
      this.queue.add(val);
      return;
    }

    // Register to the RecieveStuck event before transitioning to guarantee order.
    const recieveStuckPromise = this.current === RecieveStuck
      ? Promise.resolve()
      : this.waitForState(RecieveStuck);

    this.updateState(Transition.SEND, val);
    if (this.current === Idle) {
      abortCtrl?.abort();
      return;
    }

    await (abortPromise
      ? Promise.race([recieveStuckPromise, abortPromise])
      : recieveStuckPromise);

    if (abortCtrl?.signal.aborted) throw new AbortedError("send");
    abortCtrl?.abort();

    if (this.current === RecieveStuck) {
      return this.updateState(Transition.SEND, val);
    }
  }

  public peek(): T {
    return this.queue.peek();
  }

  public get isFull(): boolean {
    return this.queue.isFull;
  }

  public get isEmpty(): boolean {
    return this.queue.isEmpty;
  }

  /**
   * @throws {InvalidTransitionError}
   */
  protected updateState(t: Transition, val?: T): void {
    this.debug(`updateState(${t}, ${val})`);
    this.currentVal = val;
    this.current = this.current(t);
    this.transitionEventTarget.dispatchEvent(
      new CustomEvent(t, { detail: val }),
    );
    this.stateEventTarget.dispatchEvent(
      new CustomEvent(this.current.name, { detail: val }),
    );
  }

  protected waitForState(...states: State[]): Promise<T | undefined> {
    this.debug(`waitForState(${states.map((s) => s.name).join(", ")})`);
    if (states.includes(this.current)) {
      return Promise.resolve<T | undefined>(this.currentVal);
    }
    return new Promise<T | undefined>((resolve) => {
      states.forEach((state) => {
        this.stateEventTarget.addEventListener(state.name, (ev) => {
          scheduleTask(() => {
            resolve((ev as CustomEvent).detail as T);
          });
        }, { once: true });
      });
    });
  }

  protected waitForTransition(t: Transition): Promise<T | undefined> {
    this.debug("waitForTransition", t);
    return new Promise<T | undefined>((resolve) => {
      this.transitionEventTarget.addEventListener(t, (ev) => {
        scheduleTask(() => resolve((ev as CustomEvent).detail as T));
      }, { once: true });
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
  constructor(type: "send" | "recieve") {
    super(`${type} aborted`);
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
  const selectPromises: Promise<void | T | undefined>[] = items.map((item) => {
    if (item instanceof Channel) {
      return item.recieve(abortCtrl).then(([val]) => val);
    }
    return item[0].send(item[1], abortCtrl);
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
