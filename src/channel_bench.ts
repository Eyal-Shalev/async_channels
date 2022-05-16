import { Channel } from "./channel.ts";

Deno.bench("Channel.get", async () => {
  const c = new Channel<void>();
  queueMicrotask(() => c.send());
  await c.get();
  c.close();
});

Deno.bench("Channel.send", async () => {
  const c = new Channel<void>();
  queueMicrotask(() => c.get());
  await c.send();
  c.close();
});

[
  10_000,
  100_000,
  1_000_000,
].forEach((n) => {
  const data = Array(n);
  Deno.bench({
    group: `Consume Array(${n})`,
    name: `Consume Array(${n})`,
    fn: async () => {
      const c = Channel.from(data, { bufferSize: data.length });
      await c.forEach(() => {}).get();
    },
  });
  Deno.bench({
    group: `Consume Array(${n})`,
    name: `Consume Array(${n}) with Buffer(${n} / 2)`,
    fn: async () => {
      const c = Channel.from(data, { bufferSize: data.length / 2 });
      await c.forEach(() => {}).get();
    },
  });
  Deno.bench({
    group: `Consume Array(${n})`,
    name: `Consume Array(${n}) with Buffer(${n} / 4)`,
    fn: async () => {
      const c = Channel.from(data, { bufferSize: data.length / 2 });
      await c.forEach(() => {}).get();
    },
  });
  Deno.bench({
    group: `Consume Array(${n})`,
    name: `Consume Array(${n}) with Buffer(${n})`,
    fn: async () => {
      const c = Channel.from(data, { bufferSize: data.length });
      await c.forEach(() => {}).get();
    },
  });
});
