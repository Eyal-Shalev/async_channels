---
layout: default
title: Selecting a Channel operation
permalink: /getting-started/select-channel-op.md
parent: Getting Started
nav_order: 4
---

## Selecting a Channel operation

Sometimes we want to race several channel operations against each other, and
select the first operation completed (aborting the other operations).

To do that, `async_channels` provides the `select` function (and `select` tagged
template)

**Example (function):**

```js
import { Channel, select } from "...";
const done = new Channel();
const input = new Channel();

(async () => {
  while (true) {
    const [val, ch] = await select([done, input]);
    if (ch === done) return;
    console.log("Got: ", val);
  }
})().finally(() => console.log("Loop completed"));

await input.send("Hello"); // => Got: Hello
await input.send("world"); // => Got: world
done.close();

// This will not resolve, because no one is waiting for values from input.
const p = input.send("goodbye").catch((e) =>
  console.log("Expected error caught:", e.message)
);

// This will cause the above `input.send()` to reject.
input.close(); // => Expected error caught: Send on closed channel
await p; // => Loop completed
```

**Example (tagged template):**

```js
import { Channel, tagged } from "...";
const { select } = tagged;
const done = new Channel();
const input = new Channel();

(async () => {
  let cont = true;
  while (cont) {
    // Because the handler for `done` is executed inside a function, you cannot `return` or `break` from it.
    await select`
      case ${done}: ${() => cont = false}
      case ${input}: ${(val) => console.log("Got:", val)}
    `;
  }
})().finally(() => console.log("Loop completed"));

await input.send("Hello"); // => Got: Hello
await input.send("world"); // => Got: world
done.close();

// This will not resolve, because no one is waiting for values from input.
const p = input.send("goodbye").catch((e) =>
  console.log("Expected error caught:", e.message)
);

// This will cause the above `input.send()` to reject.
input.close(); // => Expected error caught: Send on closed channel
await p; // => Loop completed
```

<span class="d-flex flex-justify-start">
[Previous - Closing Channels](/async_channels/getting-started/closing-channels){: .btn .mb-4 .mb-md-0 }
</span>
