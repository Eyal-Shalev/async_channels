export const sleep = (duration: number) => {
  return new Promise<void>((res) => {
    setTimeout(() => res(), duration);
  });
};

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
