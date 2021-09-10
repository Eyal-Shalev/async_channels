import { assertEquals } from "https://deno.land/std@0.106.0/testing/asserts.ts";
import { Broadcaster } from "./broadcast.ts";
import { Channel } from "./channel.ts";
import { sleep } from "./internal/utils.ts";

Deno.test("broadcast", async () => {
  type TMsg = { topic: string; tweet: string };
  const tweeter = new Broadcaster<TMsg, string>((msg) => msg.topic);

  const ch1 = tweeter.subscribe("A");
  const ch2 = tweeter.subscribe("A");
  const ch3 = tweeter.subscribe("B");

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

Deno.test("from (async)", async () => {
  await 0;
  async function* producer(): AsyncGenerator<number> {
    for (let i = 0; i < 3; i++) {
      await sleep(100);
      yield i;
    }
  }

  const bcast = Broadcaster.from(
    producer(),
    (x) => x % 2 === 0 ? "even" : "odd",
  );

  const even1 = bcast.subscribe("even");
  const odd = bcast.subscribe("odd");
  const even2 = bcast.subscribe("even");

  const outChan = new Channel<[string, number]>();

  const p = Promise.all(
    Object.entries({ even1, odd, even2 }).map(async ([key, ch]) => {
      for await (const msg of ch) await outChan.send([key, msg]);
    }),
  ).finally(() => outChan.close());

  const expected = [
    ["even1", 0],
    ["even2", 0],
    ["odd", 1],
    ["even1", 2],
    ["even2", 2],
  ];
  for await (const actual of outChan) assertEquals(actual, expected.shift());
  assertEquals(expected.length, 0);

  await p;
});
