---
layout: default
title: Home
description: "Async Channels provides channels as a mechanism for synchronizing asynchronous functions."
permalink: /
nav_order: 1
---

# Async Channels

Channels are queue-like objects _(First In First Out)_ that their `enqueue`
(send) and `dequeue` (get) functions are asynchronous (`async`). By passing them
between asynchronous functions we can synchronize operations between said
functions.

## Example

```js
// main.js
import { Channel, time } from "...";
import { counter } from "./counter.js";
const stop = time.timeout(3500);

const counter = counter(stop);

for await (const i of counter) {
  console.log(i);
  await time.timeout(100);
}

// counter.js
import { Channel, select, time } from "...";

export function counter(stop) {
  // `res` is an unbuffered channel, so `send` will wait until a `get` is called on `res`.
  // Likewise, `get` will wait until `send` is called.
  const res = new Channel(0);

  (async () => {
    let i = 1;

    // `select` waits for the first channel that resolves.
    // If that channel is not `stop` then continue.
    while ((await select([stop, time.timeout(500)]))[1] !== stop) {
      // `select` can also wait for sending data on channels.
      // If another function is trying to read from `res`, we will send `i++` to it.
      await select([stop, [res, i++]]);
    }

    // Close the results channel when done.
    res.close();
  })();

  return res;
}
```

<span class="d-flex flex-justify-end">
[Next - Getting Started](/getting-started){: .btn .btn-primary .mb-4 .mb-md-0 .mr-2 }
</span>