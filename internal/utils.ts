import { AbortedError } from "../channel.ts";

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
