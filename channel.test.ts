import { assertEquals, assertStrictEquals } from "deno/testing/asserts.ts";
import { Channel, select } from "async-queue/channel.ts";

Deno.test("select when 1 channel is buffered", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  c1.add("c1");
  c2.add("c2");

  const [val, selectedChannel] = await select([c1, c2])
  assertEquals(val, "c2")
  assertStrictEquals(selectedChannel, c2)
});

Deno.test("select add when 1 has buffer", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  const [val, selectedChannel] = await select([[c1, "c1"], [c2, "c2"]])
  assertEquals(val, true)
  assertStrictEquals(selectedChannel, c2)
});
