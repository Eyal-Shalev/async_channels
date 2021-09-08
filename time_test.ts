import { timeout, Timer } from "./time.ts";
import { fail } from "deno/testing/asserts.ts";
import { assertNumberBetween } from "./internal/test_utils.ts";

Deno.test("The timer returns results withing resonable margin of error", async () => {
  for (const duration of [50, 100, 200]) {
    const start = new Date();
    const t = new Timer(duration);
    const res = await t.c.receive();
    const end = new Date();
    if (!res[1]) fail("unreachable");
    const val = res[0];
    assertNumberBetween(end.getTime() - val.getTime(), 0, 10);
    assertNumberBetween(
      val.getTime() - start.getTime(),
      duration,
      duration + 5,
    );
  }
});

Deno.test("timeout", async () => {
  const duration = 50;
  const start = new Date();
  await timeout(duration).receive();
  const end = new Date();
  assertNumberBetween(end.getTime() - start.getTime(), duration, duration + 10);
});
