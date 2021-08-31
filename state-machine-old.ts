export enum Transition {
  POP = "POP",
  PUSH_DONE = "PUSH_DONE",
  POP_STUCK = "POP_STUCK",
  PUSH_STUCK = "PUSH_STUCK",
  WAIT = "WAIT",
  ACK = "ACK",
}

export enum StateNames {
  EMPTY = "EMPTY",
  WAIT_FOR_PUSH = "WAIT_FOR_PUSH",
  WAIT_FOR_POP = "WAIT_FOR_POP",
  PENDING_ACK = "PENDING_ACK"
}

export class InvalidTransitionError extends TypeError {
  constructor() {
    super("Invalid transition");
  }
}

export const isEmpty = (state: State) => state === EmptyState
export const isPendingAck = (state: State) => state.stateName === StateNames.PENDING_ACK
export const isPopStuck = (state: State) => isPendingAck(state) || state.stateName === StateNames.WAIT_FOR_PUSH
export const isPushStuck = (state: State) => isPendingAck(state) || state.stateName === StateNames.WAIT_FOR_POP

export type State = ((t: Transition) => State) & { stateName: StateNames, overSize?: number }

const makePendingAckState = (next: State): State => Object.assign(
  (t: Transition) => {
    if (t === Transition.ACK) return next;
    throw new InvalidTransitionError()
  },
  {stateName: StateNames.PENDING_ACK, next}
)

const makeWaitingForPushState = (overSize = 1): State => Object.assign(
  (t: Transition) => {
    if (t === Transition.WAIT) return makePendingAckState(makeWaitingForPushState(overSize))
    if (t === Transition.POP_STUCK) return makeWaitingForPushState(overSize + 1)
    if (t === Transition.PUSH_DONE && overSize > 1) return makeWaitingForPushState(overSize - 1)
    if (t === Transition.PUSH_DONE) return EmptyState
    throw new InvalidTransitionError()
  },
  {stateName: StateNames.WAIT_FOR_PUSH, overSize}
)

const makeWaitingForPopState = (overSize = 1): State => Object.assign(
  (t: Transition) => {
    if (t === Transition.WAIT) return makePendingAckState(makeWaitingForPopState(overSize))
    if (t === Transition.PUSH_STUCK) return makeWaitingForPopState(overSize + 1)
    if (t === Transition.POP && overSize > 1) return makeWaitingForPopState(overSize - 1)
    if (t === Transition.POP) return EmptyState
    throw new InvalidTransitionError()
  },
  {stateName: StateNames.WAIT_FOR_POP, overSize}
)

export const EmptyState: State = Object.assign(
  (t: Transition) => {
    if (t === Transition.POP_STUCK) return makeWaitingForPushState()
    if (t === Transition.PUSH_STUCK) return makeWaitingForPopState()
    if (t === Transition.WAIT) return makePendingAckState(EmptyState)
    if (t === Transition.PUSH_DONE) return EmptyState
    throw new InvalidTransitionError()
  },
  {stateName: StateNames.EMPTY},
)