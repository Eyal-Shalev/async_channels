import { deferPromise } from "./utils.ts";

/**
 * The `Error` class used when an invalid transition is performed.
 */
export class InvalidTransitionError extends TypeError {
  constructor(readonly state: StateNames, readonly transition: Transitions) {
    super(
      `Invalid transition - ${state}.${transition}()`,
    );
  }
}

/**
 * The `Error` class used when the `send` transition is performed on a closed channel.
 */
export class SendOnClosedError extends Error {
  constructor() {
    super("Send on closed channel");
  }
}

/** @internal */
export type LogFn = (...args: unknown[]) => void;

/** @internal */
export type State<T> =
  | Idle<T>
  | SendStuck<T>
  | GetStuck<T>
  | Closed<T>;

/** @internal */
export type StateBase<T> =
  & { [t in "get" | "close"]: () => State<T> }
  & { send: (val: T) => State<T> };

/** @internal */
export type Transitions = keyof StateBase<unknown>;

/** @internal */
export type StateNames = State<unknown>["name"];

/** @internal */
export interface Idle<T> extends StateBase<T> {
  name: "Idle";
  get: () => GetStuck<T>;
  send: (val: T) => SendStuck<T>;
  close: () => Closed<T>;
}

/** @internal */
export function Idle<T>(debug: LogFn): Idle<T> {
  return {
    name: "Idle",
    get: () => GetStuck(debug),
    send: (val: T): SendStuck<T> => SendStuck(val, debug),
    close: () => Closed(debug),
  };
}

/** @internal */
export function isIdle<T>(s: State<T>): s is Idle<T> {
  return s.name === "Idle";
}

/** @internal */
export interface SendStuck<T> extends StateBase<T> {
  name: "SendStuck";
  promise: Promise<T>;
  get: () => Idle<T>;
  send: (val: T) => never;
  close: () => Closed<T>;
}

/** @internal */
export function SendStuck<T>(val: T, debug: LogFn): SendStuck<T> {
  const name = "SendStuck";
  const [promise, resolve, reject] = deferPromise<T>();
  return {
    name,
    promise: promise.then(
      (pVal) => {
        debug(`${name}.promise.resolve(pVal)`, { pVal, val });
        return pVal;
      },
      (error) => {
        debug(`${name}.promise.rejected(error)`, { error, val });
        return Promise.reject(error);
      },
    ),
    get: () => {
      debug(`${name}.get()`, { val });
      resolve(val);
      return Idle(debug);
    },
    send: () => {
      debug(`${name}.send()`, { val });
      throw new InvalidTransitionError(name, "send");
    },
    close: () => {
      debug(`${name}.close()`, { val });
      reject(new SendOnClosedError());
      return Closed(debug);
    },
  };
}

/** @internal */
export function isSendStuck<T>(s: State<T>): s is SendStuck<T> {
  return s.name === "SendStuck";
}

/** @internal */
export interface GetStuck<T> extends StateBase<T> {
  name: "GetStuck";
  promise: Promise<[T, true] | [undefined, false]>;
  get: () => never;
  send: (val: T) => Idle<T>;
  close: () => Closed<T>;
}

/** @internal */
export function GetStuck<T>(debug: LogFn): GetStuck<T> {
  const name = "GetStuck";
  const closeErr = new Error("Get on closed Channel");
  const [promise, resolve, reject] = deferPromise<T>();
  return {
    name,
    promise: promise.then(
      (val) => {
        debug(`${name}.promise.resolved(val)`, { val });
        return [val, true];
      },
      (error) => {
        debug(`${name}.promise.rejected(error)`, { error });
        if (error === closeErr) return [undefined, false];
        return Promise.reject(error);
      },
    ),
    get: () => {
      debug(`${name}.get()`);
      throw new InvalidTransitionError(name, "get");
    },
    send: (val: T) => {
      debug(`${name}.send()`);
      resolve(val);
      return Idle(debug);
    },
    close: () => {
      debug(`${name}.close()`, new Error().stack);
      reject(closeErr);
      return Closed(debug);
    },
  };
}

/** @internal */
export function isGetStuck<T>(s: State<T>): s is GetStuck<T> {
  return s.name === "GetStuck";
}

/** @internal */
export interface Closed<T> extends StateBase<T> {
  name: "Closed";
  get: () => never;
  send: (val: T) => never;
  close: () => Closed<T>;
}

/** @internal */
export function Closed<T>(debug: LogFn): Closed<T> {
  const name = "Closed";
  return {
    name,
    get: () => {
      debug(`${name}.get()`);
      throw new InvalidTransitionError(name, "get");
    },
    send: () => {
      debug(`${name}.send()`);
      throw new InvalidTransitionError(name, "get");
    },
    close: () => {
      debug(`${name}.close()`);
      return Closed(debug);
    },
  };
}

/** @internal */
export function isClosed<T>(s: State<T>): s is Closed<T> {
  return s.name === "Closed";
}
