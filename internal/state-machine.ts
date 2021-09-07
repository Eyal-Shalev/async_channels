export class InvalidTransitionError extends TypeError {
  constructor(readonly state: State, readonly t: Transition) {
    super(
      `Invalid transition - ${
        JSON.stringify({ state: state.name, transition: t })
      }`,
    );
  }
}

export enum Transition {
  RECEIVE = "RECEIVE",
  SEND = "SEND",
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
  if (t === Transition.CLOSE) return Closed;
  if (t === Transition.RECEIVE) return ReceiveStuck;
  if (t === Transition.SEND) return SendStuck;
  throw new InvalidTransitionError(Idle, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function ReceiveStuck(t: Transition): State {
  if (t === Transition.CLOSE) return Closed;
  if (t === Transition.SEND) return WaitingForAck;
  throw new InvalidTransitionError(ReceiveStuck, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function SendStuck(t: Transition): State {
  if (t === Transition.CLOSE) return Closed;
  if (t === Transition.RECEIVE) return ReceiveStuck;
  throw new InvalidTransitionError(SendStuck, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function WaitingForAck(t: Transition): State {
  if (t === Transition.CLOSE) return Closed;
  if (t === Transition.ACK) return Idle;
  throw new InvalidTransitionError(WaitingForAck, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function Closed(t: Transition): State {
  if (t === Transition.CLOSE) return Closed;
  throw new InvalidTransitionError(Closed, t);
}
