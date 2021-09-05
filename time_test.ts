import { assert, fail } from "deno/testing/asserts.ts";
import { timeout, Timer } from "./time.ts";
import chai from "chai";

Deno.test("The timer returns results withing resonable margin of error", async () => {
  await Promise.all([50, 100, 200].map(async (duration) => {
    const start = new Date();
    const t = new Timer(duration);
    const res = await t.c.receive();
    const current = new Date();
    if (!res[1]) fail("unreachable");
    const val = res[0];
    chai.expect(current.getTime() - val.getTime())
      .to.be.within(0, 10);
    chai.expect(val.getTime() - start.getTime())
      .to.be.within(duration, duration + 10);
  }));
});

Deno.test("timeout", async () => {
  const duration = 50;
  const start = new Date();
  await timeout(duration).receive();
  const current = new Date();
  assert(current.getTime() - start.getTime() >= duration);
  assert(current.getTime() - start.getTime() < duration + 10);
});
