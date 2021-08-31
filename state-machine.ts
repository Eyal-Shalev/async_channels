export class InvalidTransitionError extends TypeError {
  constructor(state: State, t: Transition) {
    super(
      `Invalid transition - ${JSON.stringify({ from: state.name, to: t })}`,
    );
  }
}

enum Transition {
  POP = "POP",
  PUSH = "PUSH",
  ACK = "ACK",
}

type RetryState = { type: "state"; target: State };
type RetryTransition = { type: "transition"; target: Transition };
type Retry = RetryState | RetryTransition;

type State = (t: Transition) => State;

const isState = (x: State | Retry): x is State => typeof x === "function";
const isRetry = (x: State | Retry): x is Retry => !isState(x);
const isRetryState = (x: Retry): x is RetryState => x.type === "state";
const isRetryTransition = (x: Retry): x is RetryTransition =>
  x.type === "transition";

export function Empty(t: Transition): State {
  if (t === Transition.POP) return PopStuck;
  if (t === Transition.PUSH) return PushStuck;
  throw new InvalidTransitionError(Empty, t);
}

export function PopStuck(t: Transition): State {
  if (t === Transition.PUSH) return WaitingForAck;
  // if (t === Transition.POP) return { type: "state", target: Empty };
  throw new InvalidTransitionError(PopStuck, t);
}

export function PushStuck(t: Transition): State {
  if (t === Transition.POP) return PopStuck;
  // if (t === Transition.PUSH) return { type: "state", target: Empty };
  throw new InvalidTransitionError(PushStuck, t);
}

export function WaitingForAck(t: Transition): State {
  if (t === Transition.ACK) return Empty;
  // if (t === Transition.POP) return { type: "state", target: Empty };
  // if (t === Transition.PUSH) return { type: "state", target: Empty };
  throw new InvalidTransitionError(WaitingForAck, t);
}

const scheduleTask = setTimeout;

export class StateMachine<T> {
  protected current: State = Empty;
  protected transitionEventTarget = new EventTarget();
  protected stateEventTarget = new EventTarget();

  constructor(protected readonly options?: { debug?: boolean }) {
    if (options?.debug) {
      const reporter = (prefix: string) =>
        (ev: Event) => {
          this.debug(`${prefix}::${ev.type}`, {
            val: (ev as CustomEvent).detail,
          });
        };
      Object.values(Transition).forEach((t) => {
        this.transitionEventTarget.addEventListener(t, reporter("Transition"));
      });

      [Empty, PopStuck, PushStuck, WaitingForAck].forEach((state) => {
        this.stateEventTarget.addEventListener(state.name, reporter("State"));
      });
    }
  }

  async pop(): Promise<T> {
    this.debug(`pop()`, 0);

    if ([PopStuck, WaitingForAck].includes(this.current)) {
      await this.waitForState(Empty)
      this.debug(`pop()`, 1);
    }

    // Register to the WaitingForAck event before transitioning to guarantee order.
    const valP = this.waitForState(WaitingForAck);

    this.updateState(Transition.POP);

    const val = await valP as T;
    this.debug(`pop()`, 2, { val });

    this.updateState(Transition.ACK);

    return val;
  }

  async push(val: T) {
    await "TODO: Remove me";
    this.debug(`push(${val})`, 0);

    if ([PushStuck, WaitingForAck].includes(this.current)) {
      await this.waitForState(Empty)
      this.debug(`push(${val})`, 1);
    }

    // Register to the PopStuck event before transitioning to guarantee order.
    const popStuckPromise = this.current === PopStuck
      ? Promise.resolve()
      : this.waitForState(PopStuck);

    this.updateState(Transition.PUSH, val);

    await popStuckPromise;
    this.debug(`push(${val})`, 2);

    if (this.current === PopStuck) {
      this.updateState(Transition.PUSH, val);
    }

    this.debug(`push(${val})`, 3);
  }

  /**
   * @throws {InvalidTransitionError}
   */
  updateState(t: Transition, val?: T): void {
    this.current = this.current(t);
    this.transitionEventTarget.dispatchEvent(
      new CustomEvent(t, { detail: val }),
    );
    this.stateEventTarget.dispatchEvent(
      new CustomEvent(this.current.name, { detail: val }),
    );
  }

  waitForState(state: State): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      this.stateEventTarget.addEventListener(state.name, (ev) => {
        scheduleTask(() => {
          resolve((ev as CustomEvent).detail as T);
        });
      }, { once: true });
    });
  }

  waitForTransition(t: Transition): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      this.transitionEventTarget.addEventListener(t, (ev) => {
        scheduleTask(() => resolve((ev as CustomEvent).detail as T));
      }, { once: true });
    });
  }

  protected debug(...args: unknown[]) {
    if (this.options?.debug) {
      console.debug(...args, { currentState: this.current.name });
    }
  }
}
