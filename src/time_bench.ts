import { bench, runBenchmarks } from "deno/testing/bench.ts";
import { Ticker, timeout, Timer } from "./time.ts";

[
  [1, 1000],
  [10, 100],
  [100, 10],
].forEach(([d, runs]) => {
  bench({
    runs,
    name: `Timer(${d})`,
    func: async (b) => {
      b.start();
      await new Timer(d).c.receive();
      b.stop();
    },
  });
});

[
  [1, 1000],
  [10, 100],
  [100, 10],
].forEach(([d, runs]) => {
  bench({
    runs,
    name: `timeout(${d})`,
    func: async (b) => {
      b.start();
      await timeout(d).receive();
      b.stop();
    },
  });
});

[
  [1, 1000],
  [10, 100],
  [100, 10],
].forEach(([d, runs]) => {
  bench({
    runs,
    name: `timeout(${d})`,
    func: async (b) => {
      b.start();
      await timeout(d).receive();
      b.stop();
    },
  });
});
[
  [1, 9, 40],
  [10, 6, 20],
  [100, 3, 10],
].forEach(([d, times, runs]) => {
  bench({
    runs,
    name: `Ticker(${d}) * ${times}`,
    func: async (b) => {
      b.start();

      const t = new Ticker(d);
      for (let i = 0; i < times; i++) await t.c.receive();
      t.stop();

      b.stop();
    },
  });
});

await runBenchmarks();
