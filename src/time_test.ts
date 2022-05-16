import { bench, runBenchmarks } from "deno/testing/bench.ts";
import { after, Ticker, timeout, Timer } from "./time.ts";
import { assert, assertEquals, fail } from "deno/testing/asserts.ts";
import { assertLessThan, assertNumberBetween } from "./internal/test_utils.ts";
import { select } from "./select.ts";

Deno.test("Timer", async () => {
  const start = new Date();
  const t = new Timer(50);
  let [val] = await t.c.get();
  let end = new Date();
  t.reset(50);
  if (!val) fail("unreachable");
  assertNumberBetween(end.getTime() - val.getTime(), 0, 11);
  assertNumberBetween(
    val.getTime() - start.getTime(),
    50,
    56,
  );

  [val] = await t.c.get();
  end = new Date();
  if (!val) fail("unreachable");
  assertNumberBetween(end.getTime() - val.getTime(), 0, 11);
  assertNumberBetween(
    val.getTime() - start.getTime(),
    100,
    110,
  );
});

Deno.test("Timer -> stop -> reset", async () => {
  const start = new Date();
  const t = new Timer(10);

  assertEquals(t.stop(), true);

  assertEquals(t.reset(0), false);

  let [val] = await t.c.get();
  if (!val) fail("unreachable");
  assertLessThan(val.getTime() - start.getTime(), 15);

  assertEquals(t.reset(0), false);

  [val] = await t.c.get();
  if (!val) fail("unreachable");
  assertLessThan(val.getTime() - start.getTime(), 30);

  assertEquals(t.stop(), false);

  assertEquals(t.reset(0), false);

  [val] = await t.c.get();
  if (!val) fail("unreachable");
  assertLessThan(val.getTime() - start.getTime(), 45);

  assertEquals(t.stop(), false);
});

Deno.test("timeout", async () => {
  bench({
    name: "timeout(1)",
    runs: 100,
    func: async (b) => {
      b.start();
      await timeout(1).get();
      b.stop();
    },
  });
  bench({
    name: "timeout(10)",
    runs: 10,
    func: async (b) => {
      b.start();
      await timeout(10).get();
      b.stop();
    },
  });
  bench({
    name: "timeout(50)",
    runs: 2,
    func: async (b) => {
      b.start();
      await timeout(50).get();
      b.stop();
    },
  });
  const res = await runBenchmarks({ silent: true });
  assertLessThan(res.results[0].measuredRunsAvgMs, 10);
  assertLessThan(res.results[1].measuredRunsAvgMs, 20);
  assertLessThan(res.results[2].measuredRunsAvgMs, 60);
});

Deno.test("after", async () => {
  const duration = 50;
  const start = new Date();
  const [end] = await after(duration).get();
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
  assert(expected.length === 0, `remaining items: ${String(expected)}`);
});
