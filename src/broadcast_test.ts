import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
  assertThrows,
} from "deno/testing/asserts.ts";
import {
  BroadcastChannel,
  BroadcastSendMode,
  isBroadcastSendMode,
} from "./broadcast.ts";
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

  const waitForA = aSub.get();
  await bcast.send("A");
  assertEquals(await waitForA, ["A", true]);

  const waitForB = allSub.get();
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
    aSub.get(),
    allSub.get(),
  ]);
  await bcast.send("A");
  assertEquals(await waitForA, [["A", true], ["A", true]]);

  const waitForB = allSub.get();
  await bcast.send("B");
  assertEquals(await waitForB, ["B", true]);

  let [, ch] = await select([[bcast, "B"], timeout(50)]);
  assertNotEquals(ch, bcast);

  [, ch] = await select([[bcast, "A"], timeout(50)]);
  assertNotEquals(ch, bcast);
});

Deno.test("unsubscribe (topic)", async () => {
  const bcast = new BroadcastChannel((x) => x, { sendMode: "WaitForAll" });

  const [aSub, aUnsub] = bcast.subscribe("A");
  const [allSub] = bcast.subscribeFn(() => true);
  aUnsub();

  const waitForA = allSub.get();

  await bcast.send("A");

  assertEquals(await waitForA, ["A", true]);
  assertEquals(await aSub.get(), [undefined, false]);
});

Deno.test("unsubscribe (topicFn)", async () => {
  const bcast = new BroadcastChannel((x) => x, { sendMode: "WaitForAll" });

  const [aSub] = bcast.subscribe("A");
  const [allSub, allUnsub] = bcast.subscribeFn(() => true);
  allUnsub();

  const waitForA = aSub.get();
  await bcast.send("A");
  assertEquals(await waitForA, ["A", true]);
  assertEquals(await allSub.get(), [undefined, false]);
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

Deno.test("WaitForOne with 0 subscribers", async () => {
  const bcast = new BroadcastChannel(() => true, {
    sendMode: "WaitForOne",
  });
  await assertRejects(
    () => bcast.send(""),
    Error,
    "requires at least 1 subscriber",
  );
});

Deno.test("invalid broadcast sendMode", async () => {
  const bcast = new BroadcastChannel(() => true, {
    sendMode: "invalidSendMode" as BroadcastSendMode,
  });
  await assertRejects(
    () => bcast.send(""),
    TypeError,
    "invalidSendMode",
  );
});
