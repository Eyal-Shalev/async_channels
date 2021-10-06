---
layout: default
title: Creating Chanels
permalink: /getting-started/creating-channels
parent: Getting Started
nav_order: 2
---

# Creating Chanels

## new Channel(bufferSize, options)

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

## Channel.from(input, options)

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

## .map, .filter, .forEach, ...

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
