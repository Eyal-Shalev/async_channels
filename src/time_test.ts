import { after, Ticker, Timer } from "./time.ts";
import { assert, assertEquals, fail } from "deno/testing/asserts.ts";
import { assertLessThan } from "./internal/test_utils.ts";

Deno.test("Timer", async () => {
  const runIntervals = [];
  const expectedVsActualIntervals = [];
  const duration = 10;
  for (const _ of Array(100)) {
    const start = new Date();
    const t = new Timer(duration);
    const [actualEnd] = await t.c.get();
    const expectedEnd = new Date();
    assert(actualEnd !== undefined, "channel should be open");
    runIntervals.push((actualEnd.getTime() - start.getTime()) - duration);
    expectedVsActualIntervals.push(expectedEnd.getTime() - actualEnd.getTime());
  }
  runIntervals.sort();
  expectedVsActualIntervals.sort();
  const runP95 = runIntervals[Math.floor(runIntervals.length * 0.95)];
  const expectedVsActualP95 = expectedVsActualIntervals[
    Math.floor(expectedVsActualIntervals.length * 0.95)
  ];
  assertLessThan(runP95, 2.01);
  assertLessThan(expectedVsActualP95, 3.01);
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
  const intervals = [];
  const duration = 10;
  for (const _ of Array(100)) {
    const start = new Date();
    const [end] = await after(duration).get();
    assert(end !== undefined, "channel should be open");
    intervals.push((end.getTime() - start.getTime()) - duration);
  }
  intervals.sort();
  const p95 = intervals[Math.floor(intervals.length * 0.95)];
  assertLessThan(p95, 2.01);
});

async function analyzeTicker(interval: number, times: number) {
  const data = Array(times);
  const ticker = new Ticker(interval);
  const results: number[] = [];
  const startMs = new Date().getTime();
  for (const _ of data) {
    const [val, _] = await ticker.c.get();
    assert(val);
    results.push(val.getTime());
  }
  ticker.stop();
  const resultsWithStart = [startMs, ...results];
  const intervals = results.map((next, index) =>
    (next - resultsWithStart[index]) - interval
  ).sort();

  const sum = intervals.reduce((acc, item) => acc + item);
  return {
    p95: intervals[Math.floor(intervals.length * 0.95)],
    avg: sum / times,
  };
}

Deno.test("Ticker", async () => {
  const { avg, p95 } = await analyzeTicker(10, 100);
  assertLessThan(avg, 2);
  assertLessThan(p95, 2.01);
});
