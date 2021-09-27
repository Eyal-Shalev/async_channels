import { bench, runBenchmarks } from "deno/testing/bench.ts";
import { Channel } from "./channel.ts";

bench({
  runs: 100,
  name: `Timer`,
  func: async (b) => {
    b.start();

    const c = new Channel();
    setTimeout(() => {
      c.send(1);
    });
    await c.receive();
    c.close();

    b.stop();
  },
});

await runBenchmarks();
