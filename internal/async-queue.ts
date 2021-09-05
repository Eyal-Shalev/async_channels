import { Queue } from "./queue.ts";
import {
  AddStuck,
  Closed,
  Idle,
  RemoveStuck,
  State,
  Transition,
  WaitingForAck,
} from "./state-machine.ts";

export interface AsyncQueueOptions {
  debug?: boolean;
  debugExtra?: Record<string, unknown>;
}

export class AsyncQueue<T> {
  protected currentVal?: T;
  protected current: State = Idle;
  protected transitionEventTarget = new EventTarget();
  protected stateEventTarget = new EventTarget();
  protected readonly queue: Queue<T>;

  constructor(
    bufferSize: number,
    protected readonly options?: AsyncQueueOptions,
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

      [Idle, RemoveStuck, AddStuck, WaitingForAck].forEach((state) => {
        this.stateEventTarget.addEventListener(state.name, reporter("State"));
      });
    }
  }

  public close() {
    this.updateState(Transition.CLOSE);
  }

  public async remove(
    abortCtrl?: AbortController,
  ): Promise<[T, true] | [undefined, false]> {
    this.debug("remove()");
    const abortPromise = abortCtrl && makeAbortPromise(abortCtrl);

    if ([RemoveStuck, WaitingForAck].includes(this.current)) {
      await (abortPromise
        ? Promise.race([
          this.waitForState(Idle, Closed),
          abortPromise,
        ])
        : this.waitForState(Idle, Closed));
    }

    if (abortCtrl?.signal.aborted) throw new AbortedError("remove");

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

    this.updateState(Transition.REMOVE);
    const val =
      await (abortPromise
        ? Promise.race([waitForAckPromise, abortPromise])
        : waitForAckPromise);

    if (abortCtrl?.signal.aborted) throw new AbortedError("remove");

    abortCtrl?.abort();
    this.updateState(Transition.ACK);

    if (this.queue.isEmpty) return [val as T, true];

    const valToReturn = this.queue.remove();
    this.queue.add(val as T);
    return [valToReturn, true];
  }

  public async add(val: T, abortCtrl?: AbortController): Promise<void> {
    this.debug(`add(${val})`);
    const abortPromise = abortCtrl && makeAbortPromise(abortCtrl);

    if ([AddStuck, WaitingForAck].includes(this.current)) {
      await (abortPromise
        ? Promise.race([this.waitForState(Idle)])
        : this.waitForState(Idle));
    }

    if (abortCtrl?.signal.aborted) throw new AbortedError("add");

    if (this.current === Idle && !this.queue.isFull) {
      abortCtrl?.abort();
      this.queue.add(val);
      return;
    }

    // Register to the RemoveStuck event before transitioning to guarantee order.
    const removeStuckPromise = this.current === RemoveStuck
      ? Promise.resolve()
      : this.waitForState(RemoveStuck);

    this.updateState(Transition.ADD, val);
    if (this.current === Idle) {
      abortCtrl?.abort();
      return;
    }

    await (abortPromise
      ? Promise.race([removeStuckPromise, abortPromise])
      : removeStuckPromise);

    if (abortCtrl?.signal.aborted) throw new AbortedError("add");
    abortCtrl?.abort();

    if (this.current === RemoveStuck) {
      return this.updateState(Transition.ADD, val);
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
  constructor(type: "add" | "remove") {
    super(`${type} aborted`);
  }
}
