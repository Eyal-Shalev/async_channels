import {
  assert,
  assertEquals,
  assertNotEquals,
  assertThrows,
} from "deno/testing/asserts.ts";
import { BroadcastChannel, isBroadcastSendMode } from "./broadcast.ts";
import { timeout } from "./time.ts";
import { select } from "./select.ts";

Deno.test("broadcast", async () => {
  type TMsg = { topic: string; tweet: string };
  const tweeter = new BroadcastChannel<TMsg, string>((msg) => msg.topic);

  const [ch1] = tweeter.subscribe("A");
  const [ch2] = tweeter.subscribe("A");
  const [ch3] = tweeter.subscribe("B");

  const p = Promise.all([ch1, ch2, ch3].map((ch, index) =>
    (async () => {
      const messages: TMsg[] = [];
      for await (const msg of ch) messages.push(msg);
      return { index, messages };
    })()
  ));

  await tweeter.send({ topic: "A", tweet: "A1" });
  await tweeter.send({ topic: "B", tweet: "B1" });
  await tweeter.send({ topic: "B", tweet: "B2" });
  await tweeter.send({ topic: "A", tweet: "A2" });

  tweeter.close();

  const actual = await p;

  const expected = [
    {
      index: 0,
      messages: [
        { topic: "A", tweet: "A1" },
        { topic: "A", tweet: "A2" },
      ],
    },
    {
      index: 1,
      messages: [
        { topic: "A", tweet: "A1" },
        { topic: "A", tweet: "A2" },
      ],
    },
    {
      index: 2,
      messages: [
        { topic: "B", tweet: "B1" },
        { topic: "B", tweet: "B2" },
      ],
    },
  ];

  assertEquals(actual, expected);
});

Deno.test("WaitForOne", async () => {
  const bcast = new BroadcastChannel((x) => x, { sendMode: "WaitForOne" });

  const [aSub] = bcast.subscribe("A");
  const [allSub] = bcast.subscribeFn(() => true);

  const waitForA = aSub.receive();
  await bcast.send("A");
  assertEquals(await waitForA, ["A", true]);

  const waitForB = allSub.receive();
  await bcast.send("B");
  assertEquals(await waitForB, ["B", true]);

  const [, ch] = await select([[bcast, "B"], timeout(50)]);
  assertNotEquals(ch, bcast);
});

Deno.test("WaitForAll", async () => {
  const bcast = new BroadcastChannel((x) => x, { sendMode: "WaitForAll" });

  const [aSub] = bcast.subscribe("A");
  const [allSub] = bcast.subscribeFn(() => true);

  const waitForA = Promise.all([
    aSub.receive(),
    allSub.receive(),
  ]);
  await bcast.send("A");
  assertEquals(await waitForA, [["A", true], ["A", true]]);

  const waitForB = allSub.receive();
  await bcast.send("B");
  assertEquals(await waitForB, ["B", true]);

  let [, ch] = await select([[bcast, "B"], timeout(50)]);
  assertNotEquals(ch, bcast);

  [, ch] = await select([[bcast, "A"], timeout(50)]);
  assertNotEquals(ch, bcast);
});

Deno.test("unsubscribe (fn)", async () => {
  const bcast = new BroadcastChannel((x) => x, { sendMode: "WaitForAll" });

  const [aSub] = bcast.subscribe("A");
  const [, allUnsub] = bcast.subscribeFn(() => true);
  allUnsub();

  const waitForA = aSub.receive();

  await bcast.send("A");

  assertEquals(await waitForA, ["A", true]);
});

Deno.test("unsubscribe (topic)", async () => {
  const bcast = new BroadcastChannel((x) => x, { sendMode: "WaitForAll" });

  const [, aUnsub] = bcast.subscribe("A");
  const [allSub] = bcast.subscribeFn(() => true);
  aUnsub();

  const waitForA = allSub.receive();

  await bcast.send("A");

  assertEquals(await waitForA, ["A", true]);
});

Deno.test("isBroadcastSendMode", () => {
  ["WaitForAll", "WaitForOne", "ReturnImmediately"].forEach((x) => {
    assert(isBroadcastSendMode(x));
  });
  assertEquals(isBroadcastSendMode("somethingElse"), false);
});

Deno.test("subscribe to closed BroadcastChannel", () => {
  const bcast = new BroadcastChannel((x) => x);
  bcast.close();
  assertThrows(() => bcast.subscribe(void 0));
  assertThrows(() => bcast.subscribeFn(() => true));
});
