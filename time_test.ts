import { Ticker, timeout, Timer } from "./time.ts";
import { assert, fail } from "deno/testing/asserts.ts";
import { assertNumberBetween } from "./internal/test_utils.ts";
import { select } from "./channel.ts";

Deno.test("Timer", async () => {
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

Deno.test("Ticker", async () => {
  const expected = [50, 100, 150, 200];
  const start = new Date();
  const ticker = new Ticker(50);
  const done = timeout(201);
  loop:
  while (true) {
    const res = await select([done, ticker.c]);
    switch (res[1]) {
      case done:
        break loop;
      case ticker.c: {
        const cur = new Date();
        const expectedInterval = expected.shift();
        assert(expectedInterval !== undefined, "expected more intervals");
        assertNumberBetween(
          cur.getTime() - start.getTime(),
          expectedInterval,
          expectedInterval + 15,
        );
      }
    }
  }
  ticker.stop();
  assert(expected.length === 0);
});
