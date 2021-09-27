import {
  assertRejects,
  assertStrictEquals,
  fail,
} from "deno/testing/asserts.ts";
import { Channel } from "./channel.ts";
import { select } from "./select.ts";

Deno.test("select with 0 ops", async () => {
  await assertRejects(() => select([]), TypeError);
});

Deno.test("select when 1 channel is buffered", async () => {
  console.log();
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  const ctrl = new AbortController();

  c2.send("c2", ctrl).catch((err) => fail(err));
  c1.send("c1", ctrl).then(() => fail("Should have failed"), () => {});

  const [val, selectedChannel] = await select([c1, c2]);
  ctrl.abort();
  assertStrictEquals(selectedChannel, c2);
  assertStrictEquals(val, "c2");
});

Deno.test("select send when 1 has buffer", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  const [val, selectedChannel] = await select([[c1, "c1"], [c2, "c2"]]);
  assertStrictEquals(val, true);
  assertStrictEquals(selectedChannel, c2);
});

Deno.test("select return default", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(0);

  for (const expected of [undefined, null, true, false, 0, ""]) {
    const [val, selectedChannel] = await select(
      [[c1, "c1"], c2],
      { default: expected },
    );
    assertStrictEquals(val, expected);
    assertStrictEquals(selectedChannel, undefined);
  }

  c1.close();
  c2.close();
});
