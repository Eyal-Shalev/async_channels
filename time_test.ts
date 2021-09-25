import { after, tick, Ticker, timeout, Timer } from "./time.ts";
import { assert, fail } from "deno/testing/asserts.ts";
import { assertNumberBetween } from "./internal/test_utils.ts";
import { select } from "./select.ts";

Deno.test("Timer", async () => {
  for (const duration of [50, 100, 200]) {
    const start = new Date();
    const t = new Timer(duration);
    const [val] = await t.c.receive();
    const end = new Date();
    if (!val) fail("unreachable");
    assertNumberBetween(end.getTime() - val.getTime(), 0, 11);
    assertNumberBetween(
      val.getTime() - start.getTime(),
      duration,
      duration + 6,
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

Deno.test("after", async () => {
  const duration = 50;
  const start = new Date();
  const [end] = await after(duration).receive();
  assert(end !== undefined, "channel should be open");
  assertNumberBetween(
    end.getTime() - start.getTime(),
    duration,
    duration + 10,
  );
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
        const cur = res[0];
        const expectedInterval = expected.shift();
        assert(expectedInterval !== undefined, "expected more intervals");
        assertNumberBetween(
          cur.getTime() - start.getTime(),
          expectedInterval,
          expectedInterval + 10,
        );
      }
    }
  }
  ticker.stop();
  assert(expected.length === 0);
});

Deno.test({
  name: "tick",
  // This test is expected to leak ops because there is no way to stop `tick`.
  sanitizeOps: false,
  fn: async () => {
    const expected = [50, 100, 150, 200];
    const start = new Date();
    for await (const cur of tick(50)) {
      const expectedInterval = expected.shift();
      if (expectedInterval === undefined) return;
      assertNumberBetween(
        cur.getTime() - start.getTime(),
        expectedInterval,
        expectedInterval + 10,
      );
    }
  },
});
