import { sleep } from "./internal/utils.ts";
import { Ticker, timeout, Timer } from "./time.ts";

[
  1,
  10,
  100,
].forEach((d) => {
  Deno.bench({
    name: `sleep(${d})`,
    group: `Timer(${d})`,
    fn: async () => {
      await sleep(d);
    },
  });
  Deno.bench({
    name: `Timer(${d})`,
    group: `Timer(${d})`,
    baseline: true,
    fn: async () => {
      await new Timer(d).c.get();
    },
  });
});

[
  1,
  10,
  100,
].forEach((d) => {
  Deno.bench({
    name: `sleep(${d})`,
    group: `timeout(${d})`,
    fn: async () => {
      await sleep(d);
    },
  });
  Deno.bench({
    name: `timeout(${d})`,
    group: `timeout(${d})`,
    baseline: true,
    fn: async () => {
      await timeout(d).get();
    },
  });
});

[
  [10, 50],
  [10, 100],
  [100, 10],
].forEach(([interval, times]) => {
  Deno.bench({
    group: `Ticker(${interval}, ${times})`,
    name: `setInterval(stopAfter${times}Times, ${interval})`,
    fn: async () => {
      await new Promise<void>((res) => {
        let i = 0;
        const id = setInterval(() => {
          i += 1;
          if (i >= times) {
            clearInterval(id);
            res();
          }
        }, interval);
      });
    },
  });
  Deno.bench({
    group: `Ticker(${interval}, ${times})`,
    name: `Ticker(${interval}, ${times})`,
    baseline: true,
    fn: async () => {
      const ticker = new Ticker(interval);
      for (const _ of Array(times)) {
        await ticker.c.get();
      }
      ticker.stop();
    },
  });
});
