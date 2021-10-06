---
layout: default
title: Closing Chanels
permalink: /getting-started/closing-channels
parent: Getting Started
nav_order: 3
---

# Closing Channels

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

**Example:**

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

<span class="d-flex flex-justify-between">
[Previous - Creating Channels](/async_channels/getting-started/creating-channels){: .btn .mb-4 .mb-md-0 }
[Next - Selecting a Channel operation](/async_channels/getting-started/select-channel-op){: .btn .btn-primary .mb-4 .mb-md-0 .mr-2 }
</span>
