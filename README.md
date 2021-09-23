# Async Channels

[![Test](https://github.com/Eyal-Shalev/async_channels/actions/workflows/test.yml/badge.svg)](https://github.com/Eyal-Shalev/async_channels/actions/workflows/test.yml)

Inspired by `Go` & `Clojure` Channels, `async_channels` provides channels as an
asynchronous communication method between asynchronous functions.

## Installation

### Vanilla JS (CDN)

Import the module from one of the CDNs that mirror
[npmjs.com](https://npmjs.com):

- [skypack/@eyalsh/async_channels](https://skypack.dev/view/@eyalsh/async_channels)
- [unpkg/@eyalsh/async_channels](https://unpkg.com/@eyalsh/async_channels/dist/async_channels.esm.js)

```javascript
import { Channel } from "https://cdn.skypack.dev/@eyalsh/async_channels";
const ch = new Channel();
// ...
```

### Vanilla JS (Download)

A compiled version exists for every major dependency management system in the
[releases section](https://github.com/Eyal-Shalev/async_channels/releases).\
Download one of them and import it

```javascript
import { Channel } from "/path/to/async_channels.esm.js";
const ch = new Channel();
// ...
```

### NPM (ESM)

Released under both npmjs & github packages:

- [npmjs.com:@eyalsh/async_channels](https://www.npmjs.com/package/@eyalsh/async_channels)
- [github.com:@Eyal-Shalev/async_channels](https://github.com/Eyal-Shalev/async_channels/packages/983326)

```javascript
import { Channel } from "@eyalsh/async_channels"; // or "@eyal-shalev/async_channels" for github packages.
const ch = new Channel();
// ...
```

### NPM (CommonJS)

Released under both npmjs & github packages:

- [npmjs.com:@eyalsh/async_channels](https://www.npmjs.com/package/@eyalsh/async_channels)
- [github.com:@Eyal-Shalev/async_channels](https://github.com/Eyal-Shalev/async_channels/packages/983326)

```javascript
const { Channel } = require("@eyalsh/async_channels"); // or "@eyal-shalev/async_channels" for github packages.
const ch = new Channel();
// ...
```

### Deno

```typescript
import { Channel } from "https://deno.land/x/async_channels/mod.ts";
const ch = new Channel<unknown>();
```

## Example

```typescript
import { Channel, time } from "https://deno.land/x/async_channels/mod.ts";

function produce(num: number) {
  const ch = new Channel(0);

  (async () => {
    for (let i = 0; i < num; i++) {
      await time.timeout(100).receive(); // Do some work...
      await ch.send(i);
    }
  })().catch((err) => console.error(err))
    .finally(() => ch.close());

  return ch;
}

time.timeout(300).receive().then(() => console.log("boo"));

for await (const product of produce(4)) {
  console.log({ product });
}
```
