# Async Channels

[![Latest Version](https://img.shields.io/github/v/release/eyal-shalev/async_channels?sort=semver&label=Latest%20Version)](https://github.com/Eyal-Shalev/async_channels)
[![Test & Release](https://github.com/Eyal-Shalev/async_channels/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/Eyal-Shalev/async_channels/actions/workflows/test-and-release.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

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

## Examples

- [middleware (ping-pong)](/examples/middleware)

- [pipeline (even or odd)](/examples/even-or-odd-pipeline)

- [Message Queue](/examples/message-queue)

- [static site (todos app)](/examples/todos-static)

- ```typescript
  import { Channel, time } from "https://deno.land/x/async_channels/mod.ts";

  function produce(num: number) {
    return Channel.from((async function* () {
      for (let i = 0; i < num; i++) {
        await time.timeout(100).receive(); // Do some work...
        yield i;
      }
    })());
  }

  time.timeout(300).receive().then(() => console.log("boo"));

  for await (const product of produce(4)) {
    console.log({ product });
  }
  ```
