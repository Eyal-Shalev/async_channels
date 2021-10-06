---
layout: default
title: Installation
permalink: /getting-started/installation
parent: Getting Started
nav_order: 1
---

# Installation

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

<div class="d-flex flex-justify-between">
[Previous - Getting Started](/getting-started)
{: .btn .mb-4 .mb-md-0 }
[Next - Creating Channels](/getting-started/creating-channels)
{: .btn .btn-primary .mb-4 .mb-md-0 .mr-2 }
</div>