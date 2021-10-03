import { Channel, Receiver, Sender } from "../channel.ts";
import { AbortedError, UnreachableError } from "./errors.ts";

export const sleep = (duration: number) => {
  return new Promise<void>((res) => {
    setTimeout(() => res(), duration);
  });
};

export function recordWithDefaults<TKey extends string | symbol, TVal>(
  record: Record<TKey, TVal>,
  fn: (prop: TKey) => TVal,
) {
  return new Proxy(record, {
    get: (target, prop: TKey) => {
      if (target[prop] === undefined) {
        target[prop] = fn(prop);
      }
      return target[prop];
    },
  });
}

export function ignoreAbortedError(err: unknown): Promise<void> {
  if (err instanceof AbortedError) return Promise.resolve();
  return Promise.reject(err);
}

export function makeAbortCtrl(
  signal: AbortSignal | undefined,
): AbortController | undefined {
  if (!signal) return;
  const ctrl = new AbortController();
  signal.addEventListener("abort", () => ctrl.abort());
  return ctrl;
}

export function isSafeInteger(x: unknown): x is number {
  return Number.isSafeInteger(x);
}

export function isPositiveSafeInteger(x: unknown): x is number {
  return isSafeInteger(x) && x > 0;
}

export function isNegativeSafeInteger(x: unknown): x is number {
  return isSafeInteger(x) && x < 0;
}

export function isNonNegativeSafeInteger(x: unknown): x is number {
  return isSafeInteger(x) && x >= 0;
}

export function isNonPositiveSafeInteger(x: unknown): x is number {
  return isSafeInteger(x) && x <= 0;
}

export function isSender(x: unknown): x is Sender<unknown> {
  return x instanceof Channel;
}

export function isReceiver(x: unknown): x is Receiver<unknown> {
  return x instanceof Channel;
}

export function raceAbort<T>(
  p: Promise<T>,
  type: "send" | "get",
  signal?: AbortSignal,
) {
  if (!signal) return p;
  return Promise.race([
    p,
    makeAbortPromise(type, signal),
  ]);
}

export function makeAbortPromise(
  type: "send" | "get",
  signal: AbortSignal,
): Promise<never> {
  const err = new AbortedError(type);
  if (signal.aborted) return Promise.reject(err);
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(err));
  });
}

export function deferPromise<T>(): [
  Promise<T>,
  (_: T | PromiseLike<T>) => void,
  (_?: unknown) => void,
] {
  let res: undefined | ((_: T | PromiseLike<T>) => void);
  let rej: undefined | ((_?: unknown) => void);
  const p = new Promise<T>((res2, rej2) => {
    res = res2;
    rej = rej2;
  });
  if (!res) throw new UnreachableError();
  if (!rej) throw new UnreachableError();
  return [p, res, rej];
}
