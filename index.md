---
layout: default
title: Home
nav_order: 1
description: "Async Channels provides channels as a mechanism for synchronizing asynchronous functions."
permalink: /
---

# Async Channels

Channels are queue-like objects _(First In First Out)_ that their `enqueue`
(put) and `dequeue` (get) functions are asynchronous (`async`). By passing them
between asynchronous functions we can synchronize operations between said
functions.

[Get started now](#getting-started){: .btn .btn-primary .mb-4 .mb-md-0 .mr-2 }
[View it on GitHub](https://github.com/Eyal-Shalev/async_channels){: .btn .mb-4
.mb-md-0 }

**Example:**

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

## Getting Started

- Install via `npm` (or `yarn`)
  [@eyalsh/async_channels](https://npmjs.com/package/@eyalsh/async_channels)\
  _[@eyal-shalev/async_channels](https://github.com/Eyal-Shalev/async_channels/packages/983326)
  (if you're using github packages)._
  - ESM
    ```js
    import { Channel } from "@eyalsh/async_channels";
    ```
  - CJS
    ```js
    const { Channel } = require("@eyalsh/async_channels");
    ```
- Import it from a cdn
  [cdn.skypack.dev/@eyalsh/async_channels](https://cdn.skypack.dev/@eyalsh/async_channels)
  ```js
  import { Channel } from "https://cdn.skypack.dev/@eyalsh/async_channels";
  ```
- Download the compiled library from
  [github.com/Eyal-Shalev/async_channels/releases](https://github.com/Eyal-Shalev/async_channels/releases)
  - ESM
    ```js
    import { Channel } from "/path/to/async_channels.esm.js";
    ```
  - IIFE
    ```html
    <script src="/path/to/async_channels.iife.js"></script>
    <script>
      const {Channel} = async_channels;
    </script>
    ```
