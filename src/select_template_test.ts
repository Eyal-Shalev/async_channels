import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
  fail,
} from "deno/testing/asserts.ts";
import { Channel } from "./channel.ts";
import { after } from "./time.ts";
import { select } from "./select_template.ts";
import { assertLessThan } from "./internal/test_utils.ts";

Deno.test("select receiver", async () => {
  const namesCh = new Channel<string>();
  const p1 = select`
    case ${namesCh}: ${(name) => `Hello ${name}`}
    default: ${() => fail("Shouldn't get here")}
  `;
  const p2 = namesCh.send("async_channels");
  assertEquals(await p1, "Hello async_channels");
  await p2;
});

Deno.test("select default", async () => {
  const ch = new Channel<string>();
  const p1 = select`
    case ${ch}: ${() => fail("Shouldn't get here")}
    default: ${() => "success"}
  `;
  assertEquals(await p1, "success");
});

Deno.test("select timer get", async () => {
  const ch = new Channel<string>();
  const now = new Date();
  const val = await select`
    case ${ch}: ${() => fail("Shouldn't get here")}
    case ${after(100)}: ${(t) => t}
  `;
  assert(val instanceof Date);
  assertLessThan(val.getTime(), now.getTime() + 110);
});

Deno.test("select timer send", async () => {
  const ch = new Channel<string>();
  const now = new Date();
  const val = await select`
    case ${[ch, ""]}: ${() => fail("Shouldn't get here")}
    case ${after(100)}: ${(t) => t}
  `;
  assert(val instanceof Date);
  assertLessThan(val.getTime(), now.getTime() + 110);
});

Deno.test("select with 0 ops", async () => {
  await assertRejects(() => select``, TypeError);
});

Deno.test("select when 1 channel is buffered", async () => {
  console.log();
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  const ctrl = new AbortController();

  c2.send("c2", ctrl).catch((err) => fail(err));
  c1.send("c1", ctrl).then(() => fail("Should have failed"), () => {});

  await select`
    case ${c1}: ${() => fail()}
    case ${c2}: ${(val) => assertStrictEquals(val, "c2")}
  `;
  ctrl.abort();
});

Deno.test("select send when 1 has buffer", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  const res = await select`
    case ${[c1, "c1"]}: ${() => fail()}
    case ${[c2, "c2"]}: ${() => "visited"}
  `;

  assertStrictEquals(res, "visited");
});

Deno.test("select return default", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(0);

  for (const expected of [undefined, null, true, false, 0, ""]) {
    const res = await select`
      case ${[c1, "c1"]}: ${() => fail()}
      case ${c2}: ${() => fail()}
      default: ${() => expected}
    `;
    assertStrictEquals(res, expected);
  }

  c1.close();
  c2.close();
});
