import { bench, runBenchmarks } from "deno/testing/bench.ts";
import { Channel } from "./channel.ts";

bench({
  runs: 10,
  name: `Channel(0): Send -> Receive`,
  func: async (b) => {
    b.start();

    const c = new Channel();
    const p = c.send(1);
    await c.receive();
    await p;
    c.close();

    b.stop();
  },
});

await runBenchmarks();
