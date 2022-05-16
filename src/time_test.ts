import { after, Ticker, Timer } from "./time.ts";
import { assert, assertEquals, fail } from "deno/testing/asserts.ts";
import { assertLessThan, assertNumberBetween } from "./internal/test_utils.ts";

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

async function analyzeTicker(interval: number, times: number) {
  const startMs = new Date().getTime();
  const ticker = new Ticker(interval);
  const results: number[] = [];
  for (const _ of Array(times)) {
    const [val, _] = await ticker.c.get();
    assert(val);
    results.push(val.getTime());
  }
  ticker.stop();
  const resultsWithStart = [startMs, ...results];
  const intervals = results.map((next, index) =>
    (next - resultsWithStart[index]) - interval
  );

  return {
    avg: intervals.reduce((acc, item) => acc + item) / times,
    min: Math.min(...intervals),
    max: Math.max(...intervals),
  };
}

Deno.test("Ticker", async () => {
  const { avg, min, max } = await analyzeTicker(30, 50);
  assertLessThan(avg, 2);
  assertLessThan(min, 2);
  assertLessThan(max, 3.01);
});
