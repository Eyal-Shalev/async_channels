# Async Channels
Inspired by `Go` & `Clojure` Channels, `async-channels` provides channels as an asynchronous communication method between asynchronous functions.

## Example
```typescript
import { Channel, select } from "https://deno.land/x/async-channels/mod.ts";

const sleep = (duration: number) => new Promise<void>(res => {
  setTimeout(()=>res(), duration);
});

function producer(stopChan: Channel<void>) {
  const ch = new Channel(0);
  (async () => {
    let i = 0;
    while (!(await select([stopChan], {default: true}))[1]) {
      await sleep(500); // Do some work...
      await ch.add(i++);
    }
    ch.close();
  })();

  return ch;
}

const stopChan = new Channel(0);

const productsChan = producer(stopChan)

for await (let product of productsChan) {
  if (product >= 5) stopChan.close()
  console.log({product})
}
```
