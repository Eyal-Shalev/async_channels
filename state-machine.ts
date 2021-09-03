
export class InvalidTransitionError extends TypeError {
  constructor(state: State, t: Transition) {
    super(
      `Invalid transition - ${
        JSON.stringify({ state: state.name, transition: t })
      }`,
    );
  }
}

export enum Transition {
  REMOVE = "REMOVE",
  ADD = "ADD",
  ACK = "ACK",
  CLOSE = "CLOSE",
}

/**
 * @throws {InvalidTransitionError}
 */
export type State = (t: Transition) => State;

/**
 * @throws {InvalidTransitionError}
 */
export function Idle(t: Transition): State {
  if (t === Transition.REMOVE) return RemoveStuck;
  if (t === Transition.ADD) return AddStuck;
  if (t === Transition.CLOSE) return Closed;
  throw new InvalidTransitionError(Idle, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function RemoveStuck(t: Transition): State {
  if (t === Transition.ADD) return WaitingForAck;
  if (t === Transition.CLOSE) return Closed;
  throw new InvalidTransitionError(RemoveStuck, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function AddStuck(t: Transition): State {
  if (t === Transition.REMOVE) return RemoveStuck;
  if (t === Transition.CLOSE) return Closed;
  throw new InvalidTransitionError(AddStuck, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function WaitingForAck(t: Transition): State {
  if (t === Transition.ACK) return Idle;
  if (t === Transition.CLOSE) return Closed;
  throw new InvalidTransitionError(WaitingForAck, t);
}

export function Closed(t: Transition): State {
  if (t === Transition.CLOSE) return Closed;
  throw new InvalidTransitionError(Closed, t);
}
