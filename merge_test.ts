import { assertEquals } from "deno/testing/asserts.ts";
import { Channel } from "./channel.ts";
import { merge } from "./merge.ts";

Deno.test("merge", async () => {
  const ch1 = new Channel<string>();
  const ch2 = new Channel<number>();
  const mergedChan = merge([ch1, ch2]);

  const p = Promise.all([
    ch1.send("Hello"),
    ch2.send(2),
    ch1.send("world"),
  ]).then(() => {
    ch1.close();
    ch2.close();
  });

  const expected = ["Hello", 2, "world"];
  for await (const msg of mergedChan) {
    assertEquals(msg, expected.shift());
  }

  await p;
  assertEquals(expected.length, 0, "expected stack isn't empty");
});
