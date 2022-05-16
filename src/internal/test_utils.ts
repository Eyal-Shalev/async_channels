import { AssertionError } from "deno/testing/asserts.ts";
import { format } from "deno/testing/_format.ts";
export { sleep } from "./utils.ts";

/** @internal */
export function assertNumberBetween(
  actual: number,
  min: number,
  max: number,
  msg?: string,
): void {
  msg = msg ||
    `actual: "${format(actual)}" expected to be between "${
      format(min)
    }" (inclusive) and "${format(max)}" (exclusive)`;
  if (actual < min) throw new AssertionError(msg);
  if (actual >= max) throw new AssertionError(msg);
}

/** @internal */
export function assertLessThan(
  actual: number,
  max: number,
  msg?: string,
): void {
  msg = msg ||
    `actual: ${format(actual)} >= ${format(max)},` +
      `expected ${format(actual)} < ${format(max)}`;
  if (actual >= max) throw new AssertionError(msg);
}
