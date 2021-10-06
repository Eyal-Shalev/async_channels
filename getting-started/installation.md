---
layout: default
title: Setup
permalink: /getting-started/setup
parent: Getting Started
nav_order: 1
---

# Setup

## NodeJS

Released under both npmjs & github packages:

[![npmjs.com:@eyalsh/async_channels](https://img.shields.io/badge/npmjs.com-%40eyalsh%2Fasync__channels-%23cc0000)](https://www.npmjs.com/package/@eyalsh/async_channels){:
.does-nothing}
[![github.com:@Eyal-Shalev/async_channels](https://img.shields.io/badge/github.com-%40eyal--shalev%2Fasync__channels-%233399db)](https://github.com/Eyal-Shalev/async_channels/packages/983326){:
.does-nothing}

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

## Deno

The library is available to import from
[deno.land/x/async_channels](://deno.land/x/async_channels)

```ts
import { Channel } from "https://deno.land/x/async_channels/mod.ts";
```

## Browser - CDN / Download

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

<span class="d-flex flex-justify-between">
[Previous - Getting Started](/async_channels/getting-started){: .btn .mb-4 .mb-md-0 }
[Next - Creating Channels](/async_channels/getting-started/creating-channels){: .btn .btn-primary .mb-4 .mb-md-0 .mr-2 }
</span>
