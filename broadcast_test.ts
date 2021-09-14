import { assertEquals } from "https://deno.land/std@0.106.0/testing/asserts.ts";
import { BroadcastChannel } from "./broadcast.ts";

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
