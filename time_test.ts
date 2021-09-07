import { timeout, Timer } from "./time.ts";
import { expect } from "chai";

Deno.test("The timer returns results withing resonable margin of error", async () => {
  for (const duration of [50, 100, 200]) {
    const start = new Date();
    const t = new Timer(duration);
    const res = await t.c.receive();
    const end = new Date();
    if (!res[1]) expect.fail("unreachable");
    const val = res[0];
    expect(end.getTime() - val.getTime())
      .to.be.within(0, 10);
    expect(val.getTime() - start.getTime())
      .to.be.within(duration, duration + 5);
  }
});

Deno.test("timeout", async () => {
  const duration = 50;
  const start = new Date();
  await timeout(duration).receive();
  const end = new Date();
  expect(end.getTime() - start.getTime())
    .to.be.within(duration, duration + 10);
});
