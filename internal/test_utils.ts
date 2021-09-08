import { _format, AssertionError } from "deno/testing/asserts.ts";
export const sleep = (duration: number) => {
  return new Promise<void>((res) => {
    setTimeout(() => res(), duration);
  });
};

export function assertNumberBetween(
  actual: number,
  min: number,
  max: number,
  msg?: string,
): void {
  msg = msg ||
    `actual: "${_format(actual)}" expected to be between "${
      _format(min)
    }" (inclusive) and "${_format(max)}" (exclusive)`;
  if (actual < min) throw new AssertionError(msg);
  if (actual >= max) throw new AssertionError(msg);
}
