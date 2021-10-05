---
layout: default
title: Home
nav_order: 1
description: "Async Channels provides channels as a mechanism for synchronizing asynchronous functions."
permalink: /
---

# Async Channels
{: .no_toc}

Channels are queue-like objects _(First In First Out)_ that their `enqueue`
(put) and `dequeue` (get) functions are asynchronous (`async`). By passing them
between asynchronous functions we can synchronize operations between said
functions.

[Get started now](#getting-started){: .btn .btn-primary .mb-4 .mb-md-0 .mr-2 }
[View it on GitHub](https://github.com/Eyal-Shalev/async_channels){: .btn .mb-4
.mb-md-0 }

<details open markdown="block">
  <summary>
    Table of contents
  </summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

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

## Getting Started

### Installation

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

### Creating Chanels

#### new Channel(bufferSize, options)

The obvious way to create new channels, is with the `new` keyword.

The `Channel` constructor accepts 2 arguments:

- `bufferSize`: A non-negative integer _(`0`, `1`, `2`, `3`, `...`)_ that
  determines the size of the buffer for this channel.

  `0` means a non-buffered channel, so for every `send` we need to wait for a
  `get`, and for every `get`, we need to wait for a `send`.

  A positive `bufferSize` means the channel is buffered, so `send`-ing can be
  done without waiting for `get`-s _(as long as the buffer isn't filled)_.

- `options.debug`: a `boolean` value that controls whether the debug messages
  are logged.\
  _Used for debugging the library._

- `options.debugExtra`: a `key-value` record that is used for logging debug and
  error information.\
  _Used for debugging the library._

```js
import { Channel } from "...";
const notBuffered = new Channel();
const buffered = new Channel(1);

// Will resolve immedietly.
await buffered.send("Hello");

// Will only resolve after the previous message is received (`buffered.get()`).
const p1 = buffered.send("world").then(
  () => console.log(`buffered.send("world") was resolved`),
  (e) => console.error(`something went wrong with buffered.send("world")`, e),
);

// Will only resolve when `get` is called on notBuffered.
const p2 = notBuffered.send("Goodbye").then(
  () => console.log(`notBuffered.send("Goodbye") was resolved`),
  (e) =>
    console.error(`something went wrong with notBuffered.send("Goodbye")`, e),
);

console.log(await buffered.get());
await p1;
// => buffered.send("world") was resolved
// => ["Hello", true]
console.log(await notBuffered.get());
await p2;
// => notBuffered.send("Goodbye") was resolved
// => ["Goodbye", true]
console.log(await buffered.get());
// => ["world", true]
```

#### Channel.from(input, options)

This is useful when you already have an `Iterable` (or `AsyncIterable`), and
want to consume it in it's entierty, such that all the messages are sent to the
new channel.

```js
import { Channel } from "...";
const fromIter = Channel.from([1, 2]);
const fromAsyncIter = Channel.from(
  (async function* () {
    for (let i = 3; i < 5; i++) {
      yield i;
      console.log("yield", i);
    }
  })(),
  { bufferSize: 1 },
);
// => yield 3
console.log(await fromIter.get()); // => [1, true]
console.log(await fromIter.get()); // => [2, true]
console.log(await fromIter.get()); // => [undefined, false]
console.log(await fromAsyncIter.get());
// => yield 4
// => [3, true]
console.log(await fromAsyncIter.get()); // => [4, true]
console.log(await fromAsyncIter.get()); // => [undefined, false]
```

#### .map, .filter, .forEach, ...

Each channel comes with a set of pipeline methods (`map`, `filter`, `forEach`,
...). These methods will return a **new** channel that consumes the original
channel (unless aborted before completion). See API documentation for each of
these functions for specific information on how they work.

Below is an example usage that combines some of them.

```js
import { Channel } from "...";
const [res] = await Channel.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  .filter((n) => n % 2 === 0)
  .map((n) => n * 2)
  .reduce((prev, cur) => prev + cur)
  .get();
console.log(res); // => 40
```

### Closing Channels

To close a channel, call the `.close()` method on it.

While receiving data from a closed channel is fine, sending data on a closed
channel will cause an error to be thrown.

For that reason, it's best practice that the function that sends messages on the
channel, will be the one that closes it.

If the channel is closed and there are no more messages in the buffer, calling
`.get()` will resolve immediately with `[undefined, false]`. On all other cases
it will resolve (when a value is available) with `[THE_VALUE, true]`.

Note: `Channel.from(...)` and the built-in pipe functions will close the channel
when they are done consuming the input. If the input was another Channel, then
you have to close the input channel, for that to happen.

Example:

```js
import { Channel } from "...";
const input = new Channel();
const p = input.forEach((x) => console.log(".forEach() got: ", x))
  .get()
  .finally(() => console.log(".forEach() was resolved"));

await input.send("Hello"); // => .forEach() got: Hello
await input.send("world"); // => .forEach() got: world
input.close();
console.log(await p);
// => .forEach() was resolved
// => [undefined, false]
```
