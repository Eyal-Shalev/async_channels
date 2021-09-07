import { expect } from "chai";
import {
  Closed,
  Idle,
  InvalidTransitionError,
  ReceiveStuck,
  SendStuck,
  State,
  Transition,
  WaitingForAck,
} from "./state-machine.ts";

const data: [State, Transition, State | false][] = [
  [Idle, Transition.CLOSE, Closed],
  [Idle, Transition.SEND, SendStuck],
  [Idle, Transition.RECEIVE, ReceiveStuck],
  [Idle, Transition.ACK, false],

  [ReceiveStuck, Transition.CLOSE, Closed],
  [ReceiveStuck, Transition.SEND, WaitingForAck],
  [ReceiveStuck, Transition.RECEIVE, false],
  [ReceiveStuck, Transition.ACK, false],

  [SendStuck, Transition.CLOSE, Closed],
  [SendStuck, Transition.SEND, false],
  [SendStuck, Transition.RECEIVE, ReceiveStuck],
  [SendStuck, Transition.ACK, false],

  [WaitingForAck, Transition.CLOSE, Closed],
  [WaitingForAck, Transition.SEND, false],
  [WaitingForAck, Transition.RECEIVE, false],
  [WaitingForAck, Transition.ACK, Idle],

  [Closed, Transition.CLOSE, Closed],
  [Closed, Transition.SEND, false],
  [Closed, Transition.RECEIVE, false],
  [Closed, Transition.ACK, false],
];

data.forEach(([from, t, to]) => {
  if (to) {
    Deno.test(`${from.name}(${t}) === ${to.name}`, () => {
      expect(from(t)).to.equal(to);
    });
  } else {
    Deno.test(`${from.name}(${t}) throws InvalidTransitionError`, () => {
      expect(() => from(t)).to.throw(InvalidTransitionError);
    });
  }
});
