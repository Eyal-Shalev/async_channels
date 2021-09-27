import { deferPromise } from "./utils.ts";

export type LogFn = (...args: unknown[]) => void;

export type State<T> =
  | Idle<T>
  | SendStuck<T>
  | GetStuck<T>
  | Closed<T>;

export type StateBase<T> =
  & { [t in "get" | "close" /*| "ack" */]: () => State<T> }
  & { send: (val: T) => State<T> };

export type Transitions = keyof StateBase<unknown>;

export type StateNames = State<unknown>["name"];

export class InvalidTransitionError extends TypeError {
  constructor(readonly state: StateNames, readonly transition: Transitions) {
    super(
      `Invalid transition - ${JSON.stringify({ state, transition })}`,
    );
  }
}
export class SendOnClosedError extends Error {
  constructor() {
    super("Send on closed channel");
  }
}

export interface Idle<T> extends StateBase<T> {
  name: "Idle";
  get: () => GetStuck<T>;
  send: (val: T) => SendStuck<T>;
  close: () => Closed<T>;
}
export function Idle<T>(debug: LogFn): Idle<T> {
  return {
    name: "Idle",
    get: () => GetStuck(debug),
    send: (val: T): SendStuck<T> => SendStuck(val, debug),
    close: () => Closed(debug),
  };
}
export function isIdle<T>(s: State<T>): s is Idle<T> {
  return s.name === "Idle";
}

export interface SendStuck<T> extends StateBase<T> {
  name: "SendStuck";
  promise: Promise<T>;
  get: () => Idle<T>;
  send: (val: T) => never;
  close: () => Closed<T>;
}
export function SendStuck<T>(val: T, debug: LogFn): SendStuck<T> {
  const [promise, resolve, reject] = deferPromise<T>();
  return {
    name: "SendStuck",
    promise: promise.then(
      (pVal) => {
        debug("SendStuck.promise.resolve(pVal)", { pVal, val });
        return pVal;
      },
      (error) => {
        debug("SendStuck.promise.rejected(error)", { error, val });
        return Promise.reject(error);
      },
    ),
    get: () => {
      debug("SendStuck.get()", { val });
      resolve(val);
      return Idle(debug);
    },
    send: () => {
      debug("SendStuck.send()", { val });
      throw new InvalidTransitionError("SendStuck", "send");
    },
    close: () => {
      debug("SendStuck.close()", { val });
      reject(new SendOnClosedError());
      return Closed(debug);
    },
  };
}
export function isSendStuck<T>(s: State<T>): s is SendStuck<T> {
  return s.name === "SendStuck";
}

export interface GetStuck<T> extends StateBase<T> {
  name: "GetStuck";
  promise: Promise<[T, true] | [undefined, false]>;
  get: () => never;
  send: (val: T) => Idle<T>;
  close: () => Closed<T>;
}
export function GetStuck<T>(debug: LogFn): GetStuck<T> {
  const closeErr = new Error("Get on closed Channel");
  const [promise, resolve, reject] = deferPromise<T>();
  return {
    name: "GetStuck",
    promise: promise.then(
      (val) => {
        debug("GetStuck.promise.resolved(val)", { val });
        return [val, true];
      },
      (error) => {
        debug("GetStuck.promise.rejected(error)", { error });
        if (error === closeErr) return [undefined, false];
        return Promise.reject(error);
      },
    ),
    get: () => {
      debug("GetStuck.get()");
      throw new InvalidTransitionError("GetStuck", "get");
    },
    send: (val: T) => {
      debug("GetStuck.send()");
      resolve(val);
      return Idle(debug);
    },
    close: () => {
      debug("GetStuck.close()", new Error().stack);
      reject(closeErr);
      return Closed(debug);
    },
  };
}
export function isGetStuck<T>(s: State<T>): s is GetStuck<T> {
  return s.name === "GetStuck";
}

export interface Closed<T> extends StateBase<T> {
  name: "Closed";
  get: () => never;
  send: (val: T) => never;
  close: () => Closed<T>;
}
export function Closed<T>(debug: LogFn): Closed<T> {
  return {
    name: "Closed",
    get: () => {
      debug("Closed.get()");
      throw new InvalidTransitionError("Closed", "get");
    },
    send: () => {
      debug("Closed.send()");
      throw new InvalidTransitionError("Closed", "get");
    },
    close: () => {
      debug("Closed.close()");
      return Closed(debug);
    },
  };
}
export function isClosed<T>(s: State<T>): s is Closed<T> {
  return s.name === "Closed";
}
