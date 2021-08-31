export class InvalidTransitionError extends TypeError {
  constructor() {
    super("Invalid transition");
  }
}

enum Transition {
  POP = "POP",
  PUSH = "PUSH",
  ACK = "ACK",
}

type RetryState = { type: "state", target: State }
type RetryTransition = { type: "transition", target: Transition }
type Retry = RetryState | RetryTransition

type State = (t: Transition) => State | Retry

const isState = (x: State | Retry): x is State => typeof x === "function";
const isRetry = (x: State | Retry): x is Retry => !isState(x);
const isRetryState = (x: Retry): x is RetryState => x.type === "state";
const isRetryTransition = (x: Retry): x is RetryTransition => x.type === "transition";

export function Empty(t: Transition): State {
  if (t === Transition.POP) return PopStuck;
  if (t === Transition.PUSH) return PushStuck;
  throw new InvalidTransitionError();
}

export function PopStuck(t: Transition): State | Retry {
  if (t === Transition.PUSH) return WaitingForAck;
  if (t === Transition.POP) return {type: "state", target: Empty};
  throw new InvalidTransitionError();
}

export function PushStuck(t: Transition): State | Retry {
  if (t === Transition.POP) return PopStuck;
  if (t === Transition.PUSH) return {type: "state", target: Empty};
  throw new InvalidTransitionError();
}

export function WaitingForAck(t: Transition): State | Retry {
  if (t === Transition.ACK) return Empty;
  if (t === Transition.POP) return {type: "state", target: Empty};
  if (t === Transition.PUSH) return {type: "state", target: Empty};
  throw new InvalidTransitionError();
}

const scheduleTask = setTimeout;

export class StateMachine<T> {
  protected current: State = Empty;
  protected transitionEventTarget = new EventTarget();
  protected stateEventTarget = new EventTarget();

  constructor() {
    const reporter = (prefix: string) => (ev: Event) => {
      console.debug(`${prefix}::${ev.type}`, {val: (ev as CustomEvent).detail});
    };
    Object.values(Transition).forEach(t => {
      this.transitionEventTarget.addEventListener(t, reporter("Transition"));
    });

    [Empty, PopStuck, PushStuck, WaitingForAck].forEach(state => {
      this.stateEventTarget.addEventListener(state.name, reporter("State"));
    });
  }

  async pop(): Promise<T> {
    // Register to the WaitingForAck event before transitioning to guarantee order.
    const valP = this.waitForState(WaitingForAck);

    await this.updateState(Transition.POP);
    const val = await valP as T;
    await this.updateState(Transition.ACK);
    return val;
  }

  async push(val: T) {
    await this.updateState(Transition.PUSH, val);
    if (this.current === PushStuck) {
      await this.waitForState(PopStuck);
      await this.updateState(Transition.PUSH, val);
    }
  }

  async updateState(t: Transition, val?: T): Promise<void> {
    const next = this.current(t);
    if (isState(next)) {
      this.current = next;
      this.transitionEventTarget.dispatchEvent(new CustomEvent(t, {detail: val}));
      this.stateEventTarget.dispatchEvent(new CustomEvent(this.current.name, {detail: val}));
      return;
    }

    // throw new InvalidTransitionError();

    if (isRetryState(next)) {
      await this.waitForState(next.target);
      return this.updateState(t);
    }

    await this.waitForTransition(next.target);
    return this.updateState(t);
  }

  waitForState(state: State): Promise<T | undefined> {
    return new Promise<T | undefined>(resolve => {
      this.stateEventTarget.addEventListener(state.name, ev => {
        scheduleTask(() => {
          resolve((ev as CustomEvent).detail as T);
        });
      }, {once: true});
    });
  }

  waitForTransition(t: Transition): Promise<T | undefined> {
    return new Promise<T | undefined>(resolve => {
      this.transitionEventTarget.addEventListener(t, ev => {
        scheduleTask(() => resolve((ev as CustomEvent).detail as T));
      }, {once: true});
    });
  }
}


// const transitionEventTarget = new EventTarget();
// const stateEventTarget = new EventTarget();
//
// function dispatchEvents(state: State, t: Transition) {
//   transitionEventTarget.dispatchEvent(new CustomEvent(t.name, {detail: t.val}));
//   stateEventTarget.dispatchEvent(new CustomEvent(state.name, {detail: t.val}));
// }
//
// export async function waitForState(state: State): Promise<T | undefined> {
//   return new Promise<T | undefined>(resolve => {
//     stateEventTarget.addEventListener(state.name, ev => {
//       resolve((ev as CustomEvent).detail as T);
//     }, {once: true});
//   });
// }
//
// export async function waitForTransition(tName: TransitionNames): Promise<T | undefined> {
//   return new Promise<T | undefined>(resolve => {
//     transitionEventTarget.addEventListener(tName, ev => {
//       resolve((ev as CustomEvent).detail as T);
//     }, {once: true});
//   });
// }