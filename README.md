# Async Channels

[![Test](https://github.com/Eyal-Shalev/async-channels/actions/workflows/test.yml/badge.svg)](https://github.com/Eyal-Shalev/async-channels/actions/workflows/test.yml)

Inspired by `Go` & `Clojure` Channels, `async-channels` provides channels as an
asynchronous communication method between asynchronous functions.

## Example

```typescript
import { Channel } from "https://deno.land/x/async-channels/mod.ts";

const sleep = (duration: number) =>
  new Promise<void>((res) => {
    setTimeout(() => res(), duration);
  });

function produce(num: number) {
  const ch = new Channel(0);
  (async () => {
    for (let i = 0; i < num; i++) {
      await sleep(500); // Do some work...
      await ch.add(i++);
    }
    ch.close();
  })();

  return ch;
}

sleep(200).then(() => console.log("boo"));

for await (let product of produce(5)) {
  console.log({ product });
}
```
