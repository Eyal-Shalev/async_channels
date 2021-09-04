import { assert } from "deno/testing/asserts.ts";
import { Timer } from "./time.ts";

Deno.test("The timer returns results withing resonable margin of error", async () => {
  await Promise.all([50, 100, 200].map(async (duration) => {
    const start = new Date();
    const t = new Timer(duration);
    const val = await t.c.remove();
    const current = new Date();
    assert(
      current.getTime() - val.getTime() < 15,
      JSON.stringify({ current, val }),
    );
    assert(
      val.getTime() - start.getTime() >= duration,
      JSON.stringify({ val, start }),
    );
    assert(
      val.getTime() - start.getTime() < duration + 10,
      JSON.stringify({ val, start }),
    );
  }));
});
