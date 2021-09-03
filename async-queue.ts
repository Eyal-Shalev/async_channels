import { Queue } from "async-queue/queue.ts";
import {
  AddStuck,
  Idle,
  RemoveStuck,
  State,
  Transition,
  WaitingForAck,
  Closed,
} from "async-queue/state-machine.ts";

export interface AsyncQueueOptions {
  debug?: boolean;
}

export class AsyncQueue<T> {
  protected currentVal?: T;
  protected current: State = Idle;
  protected transitionEventTarget = new EventTarget();
  protected stateEventTarget = new EventTarget();
  protected readonly queue: Queue<T>;

  constructor(
    capacity: number,
    protected readonly options?: AsyncQueueOptions,
  ) {
    this.queue = new Queue<T>(capacity);
    if (options?.debug) {
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

  public close(): void {
    this.updateState(Transition.CLOSE);
  }

  public async remove(): Promise<T|undefined> {
    if ([RemoveStuck, WaitingForAck].includes(this.current)) {
      await this.waitForState(Idle, Closed);
    }

    if (this.current === Closed) return undefined;

    if (this.current === Idle && !this.queue.isEmpty) {
      return this.queue.remove();
    }

    // Register to the WaitingForAck event before transitioning to guarantee order.
    const waitForAckPromise = this.waitForState(WaitingForAck, Closed);

    this.updateState(Transition.REMOVE);
    const val = await waitForAckPromise as T;
    if (this.current === Closed) return undefined;
    this.updateState(Transition.ACK);

    if (this.queue.isEmpty) return val;

    const valToReturn = this.queue.remove();
    this.queue.add(val);
    return valToReturn;
  }

  public async add(val: T): Promise<void> {
    if ([AddStuck, WaitingForAck].includes(this.current)) {
      await this.waitForState(Idle);
    }

    if (this.current === Idle && !this.queue.isFull) {
      this.queue.add(val);
      return;
    }

    // Register to the RemoveStuck event before transitioning to guarantee order.
    const afterAddPromise = this.current === RemoveStuck
      ? Promise.resolve()
      : this.waitForState(RemoveStuck);

    this.updateState(Transition.ADD, val);
    if (this.current === Idle) return;

    await afterAddPromise;

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
    if (states.includes(this.current)) {
      return Promise.resolve<T | undefined>(this.currentVal);
    }
    return new Promise<T | undefined>((resolve) => {
      states.forEach(state => {
        this.stateEventTarget.addEventListener(state.name, (ev) => {
          scheduleTask(() => {
            resolve((ev as CustomEvent).detail as T);
          });
        }, { once: true });
      });
    });
  }

  protected waitForTransition(...transitions: Transition): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      transitions.forEach(t => {
        this.transitionEventTarget.addEventListener(t, (ev) => {
          scheduleTask(() => resolve((ev as CustomEvent).detail as T));
        }, { once: true });
      });
    });
  }

  protected debug(...args: unknown[]) {
    if (this.options?.debug) {
      console.debug(...args, { currentState: this.current.name });
    }
  }
}

const scheduleTask = setTimeout;
