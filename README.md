# Async Channels

[![Latest Version](https://img.shields.io/github/v/release/eyal-shalev/async_channels?sort=semver&label=Version)](https://github.com/Eyal-Shalev/async_channels)
[![Test & Release](https://github.com/Eyal-Shalev/async_channels/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/Eyal-Shalev/async_channels/actions/workflows/test-and-release.yml)
[![codecov](https://codecov.io/gh/Eyal-Shalev/async_channels/branch/main/graph/badge.svg?token=9EWOZTN2BP)](https://codecov.io/gh/Eyal-Shalev/async_channels)
[![nodejs minimum version](https://img.shields.io/node/v/@eyalsh/async_channels)](https://www.npmjs.com/package/@eyalsh/async_channels)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Channels are queue-like objects _(First In First Out)_ that their `enqueue`
(send) and `dequeue` (get) functions are asynchronous (`async`). By passing them
between asynchronous functions we can synchronize operations between said
functions.

## Setup

### NodeJS

Released under both npmjs & github packages:

[![npmjs.com:@eyalsh/async_channels](https://img.shields.io/badge/npmjs.com-%40eyalsh%2Fasync__channels-%23cc0000)](https://www.npmjs.com/package/@eyalsh/async_channels)
[![github.com:@Eyal-Shalev/async_channels](https://img.shields.io/badge/github.com-%40eyal--shalev%2Fasync__channels-%233399db)](https://github.com/Eyal-Shalev/async_channels/packages/983326)

**Install:**

<details open markdown="block">
<summary>npm</summary>

```shell
npm install @eyalsh/async_channels
```

</details>

<details markdown="block">
<summary>yarn</summary>

```shell
yarn add @eyal-shalev/async_channels
```

</details>

**import (ES Modules):**

```js
import { Channel } from "@eyalsh/async_channels";
```

**require (CommonJS):**

```js
const { Channel } = require("@eyalsh/async_channels");
```

### Deno

The library is available to import from
[deno.land/x/async_channels](://deno.land/x/async_channels)

```ts
import { Channel } from "https://deno.land/x/async_channels/mod.ts";
```

### Browser - CDN / Download

You can import the library from any CDN that mirrors _npmjs.com_, such as
[skypack.dev](://skypack.dev/view/@eyalsh/async_channels) or
[unpkg.com](https://unpkg.com/@eyalsh/async_channels/dist/async_channels.esm.js).

```js
import { Channel } from "https://cdn.skypack.dev/@eyalsh/async_channels";
```

Or you can download compiled library from GitHub:

- [Latest Release](://github.com/Eyal-Shalev/async_channels/releases/latest)
- [All Releases](://github.com/Eyal-Shalev/async_channels/releases)

```js
import { Channel } from "/path/to/async_channels.esm.js";
```

_Note: an IIFE version also exist, if your application doesn't support ES
modules._

```html
<script src="/path/to/async_channels.iife.js"></script>
<script>
  const {Channel} = async_channels;
</script>
```

## Examples

- [middleware (ping-pong)](/examples/middleware)

- [pipeline (even or odd)](/examples/even-or-odd-pipeline)

- [pipeline (lorem-ipsum)](/examples/lorem-ipsum-pipeline)

- [Message Queue](/examples/message-queue)

- [static site (todos app)](/examples/todos-static)

- ```ts
  import { Channel, time } from "https://deno.land/x/async_channels/mod.ts";

  function produce(num: number) {
    return Channel.from((async function* () {
      for (let i = 0; i < num; i++) {
        await time.timeout(100).get(); // Do some work...
        yield i;
      }
    })());
  }

  time.timeout(300).get().then(() => console.log("boo"));

  for await (const product of produce(4)) {
    console.log({ product });
  }
  ```
