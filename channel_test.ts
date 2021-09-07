import { sleep } from "./internal/test_utils.ts";
import { expect } from "chai";
import { Channel, select } from "./channel.ts";
import { InvalidTransitionError } from "./internal/state-machine.ts";

Deno.test("no-buffer receive -> send", async () => {
  const chan = new Channel<string>(0);
  expect(await Promise.all([chan.receive(), chan.send("a")]))
    .to.deep.equal([["a", true], undefined]);
});

Deno.test("no-buffer send -> receive", async () => {
  const chan = new Channel<string>(0);

  expect(await Promise.all([chan.send("a"), chan.receive()]))
    .to.deep.equal([undefined, ["a", true]]);
});

Deno.test("no-buffer receive -> receive -> send -> send", async () => {
  const chan = new Channel<string>(0);

  const [getA, getB, ..._] = await Promise.all([
    chan.receive(),
    chan.receive(),
    chan.send("a"),
    chan.send("b"),
  ]);

  expect(getA).to.deep.equal(["a", true]);
  expect(getB).to.deep.equal(["b", true]);
});

Deno.test("no-buffer send -> send -> receive -> receive", async () => {
  const chan = new Channel<string>(0);

  const [_a, _b, getA, getB] = await Promise.all([
    chan.send("a"),
    chan.send("b"),
    chan.receive(),
    chan.receive(),
  ]);

  expect(getA).to.deep.equal(["a", true]);
  expect(getB).to.deep.equal(["b", true]);
});

Deno.test("no-buffer send -> receive; receive -> send", async () => {
  const chan = new Channel<string>(0);

  const [_a, getA] = await Promise.all([chan.send("a"), chan.receive()]);
  const [getB, _b] = await Promise.all([chan.receive(), chan.send("b")]);

  expect(getA).to.deep.equal(["a", true]);
  expect(getB).to.deep.equal(["b", true]);
});

Deno.test("buffered send -> receive", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  expect(await chan.receive()).to.deep.equal(["a", true]);
});

Deno.test("buffered send -> send -> receive -> receive", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");

  const [_b, getA] = await Promise.all([chan.send("b"), chan.receive()]);
  expect(getA).to.deep.equal(["a", true]);
  expect(await chan.receive()).to.deep.equal(["b", true]);
});

Deno.test("buffered send -> receive; receive -> send", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  expect(await chan.receive()).to.deep.equal(["a", true]);
  await chan.send("b");
  expect(await chan.receive()).to.deep.equal(["b", true]);
});

Deno.test("buffered send -> send -> send -> receive -> receive -> receive", async () => {
  const chan = new Channel<string>(2);

  await chan.send("a");
  await chan.send("b");

  const [_c, getA] = await Promise.all([chan.send("c"), chan.receive()]);
  expect(getA).to.deep.equal(["a", true]);

  expect(await chan.receive()).to.deep.equal(["b", true]);
  expect(await chan.receive()).to.deep.equal(["c", true]);
});

Deno.test("send -> close -> receive -> receive", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  chan.close();

  expect(await chan.receive()).to.deep.equal(["a", true]);
  expect(await chan.receive()).to.deep.equal([undefined, false]);
});

Deno.test("send -> close -> receive -> send", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  chan.close();

  expect(await chan.receive()).to.deep.equal(["a", true]);
  await chan.send("b").then(
    () => expect.fail(),
    (e) => expect(e).to.be.an.instanceOf(InvalidTransitionError),
  );
});
Deno.test("send -> close -> send", async () => {
  const chan = new Channel<string>(1);

  await chan.send("a");
  chan.close();

  await chan.send("b").then(
    () => expect.fail(),
    (e) => expect(e).to.be.an.instanceOf(InvalidTransitionError),
  );
});

Deno.test("select when 1 channel is buffered", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  const ctrl = new AbortController();

  c1.send("c1", ctrl).then(() => expect.fail("Should have failed"), () => {});
  c2.send("c2", ctrl).catch((err) => expect.fail(err));

  const [val, selectedChannel] = await select([c1, c2]);
  ctrl.abort();
  expect(selectedChannel).to.deep.equal(c2);
  expect(val).to.deep.equal("c2");
});

Deno.test("select send when 1 has buffer", async () => {
  const c1 = new Channel<string>(0);
  const c2 = new Channel<string>(1);

  const [val, selectedChannel] = await select([[c1, "c1"], [c2, "c2"]]);
  expect(val).to.be.true;
  expect(selectedChannel).to.deep.equal(c2);
});

Deno.test("channel as an async iterator", async () => {
  const chan = new Channel<string>(1);

  const out: string[] = [];

  (async () => {
    for (const x of ["a", "b"]) {
      await sleep(20);
      await chan.send(x);
    }
    chan.close();
  })();

  const p = sleep(30).then(() => out.push("boo"));

  for await (const v of chan) out.push(v);

  await p;

  expect(out).to.deep.equal(["a", "boo", "b"]);
});
