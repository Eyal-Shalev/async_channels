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

/**
 * @throws {InvalidTransitionError}
 */
type State = (t: Transition) => State;

/**
 * @throws {InvalidTransitionError}
 */
export function Empty(t: Transition): State {
  if (t === Transition.POP) return PopStuck;
  if (t === Transition.PUSH) return PushStuck;
  throw new InvalidTransitionError(Empty, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function PopStuck(t: Transition): State {
  if (t === Transition.PUSH) return WaitingForAck;
  throw new InvalidTransitionError(PopStuck, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function PushStuck(t: Transition): State {
  if (t === Transition.POP) return PopStuck;
  throw new InvalidTransitionError(PushStuck, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function WaitingForAck(t: Transition): State {
  if (t === Transition.ACK) return Empty;
  throw new InvalidTransitionError(WaitingForAck, t);
}

const scheduleTask = setTimeout;

export class AsyncStack<T> {
  protected current: State = Empty;
  protected transitionEventTarget = new EventTarget();
  protected stateEventTarget = new EventTarget();

  constructor(protected readonly options?: { debug?: boolean }) {
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

      [Empty, PopStuck, PushStuck, WaitingForAck].forEach((state) => {
        this.stateEventTarget.addEventListener(state.name, reporter("State"));
      });
    }
  }

  async pop(): Promise<T> {
    if ([PopStuck, WaitingForAck].includes(this.current)) {
      await this.waitForState(Empty);
    }

    // Register to the WaitingForAck event before transitioning to guarantee order.
    const valP = this.waitForState(WaitingForAck);

    this.updateState(Transition.POP);

    const val = await valP as T;

    this.updateState(Transition.ACK);

    return val;
  }

  async push(val: T) {
    if ([PushStuck, WaitingForAck].includes(this.current)) {
      await this.waitForState(Empty);
    }

    // Register to the PopStuck event before transitioning to guarantee order.
    const popStuckPromise = this.current === PopStuck
      ? Promise.resolve()
      : this.waitForState(PopStuck);

    this.updateState(Transition.PUSH, val);

    await popStuckPromise;

    if (this.current === PopStuck) {
      this.updateState(Transition.PUSH, val);
    }
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
