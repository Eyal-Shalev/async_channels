import { assertEquals, fail } from "deno/testing/asserts.ts";
import { Channel } from "./channel.ts";
import subscribe from "./subscribe.ts";

Deno.test("subscribe", async () => {
  console.log();

  type TMsg = { topic: string; tweet: string };

  const tweeter = new Channel<TMsg>(0);

  const {
    A: ch1,
    B: ch2,
    [subscribe.other]: ch3,
  } = tweeter.with(subscribe((msg) => msg.topic, ["A", "B"]));

  const p = Promise.all([ch1, ch2, ch3].map((ch, index) =>
    (async () => {
      const messages: TMsg[] = [];
      for await (const msg of ch) messages.push(msg);
      return { index, messages };
    })()
  )).catch(fail);

  await Promise.all([
    tweeter.send({ topic: "A", tweet: "A1" }),
    tweeter.send({ topic: "B", tweet: "B1" }),
    tweeter.send({ topic: "C", tweet: "C1" }),
    tweeter.send({ topic: "B", tweet: "B2" }),
    tweeter.send({ topic: "A", tweet: "A2" }),
    tweeter.send({ topic: "D", tweet: "D1" }),
  ]).catch(fail)
    .finally(() => tweeter.close());

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
        { topic: "B", tweet: "B1" },
        { topic: "B", tweet: "B2" },
      ],
    },
    {
      index: 2,
      messages: [
        { topic: "C", tweet: "C1" },
        { topic: "D", tweet: "D1" },
      ],
    },
  ];

  assertEquals(actual, expected);
});
