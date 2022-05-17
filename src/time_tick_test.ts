import { tick } from "./time.ts";
import { assertNumberBetween } from "./internal/test_utils.ts";
import { isDeno } from "which_runtime";

// Note: This test was moved outside of time_test.ts because it leaks ops and causes other tests to fail.

Deno.test({
  name: "tick",
  ignore: !isDeno,
  // This test is expected to leak ops & resources because there is no way to stop `tick`.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const expected = [50, 100, 150, 200];
    const start = new Date();
    for await (const cur of tick(50)) {
      const expectedInterval = expected.shift();
      if (expectedInterval === undefined) return;
      assertNumberBetween(
        cur.getTime() - start.getTime(),
        expectedInterval,
        expectedInterval + 10,
      );
    }
  },
});
