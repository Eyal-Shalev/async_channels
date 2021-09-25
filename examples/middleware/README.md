# Middleware Example (ping pong)

## API

Run the following to start the example.

```shell
deno run \
  --allow-net="0.0.0.0:5000" --reload \
  --import-map https://deno.land/x/async_channels/scripts/import_map.json \
  https://deno.land/x/async_channels/examples/middleware/ping_pong.ts
```

### GET /api/ping

This will return a message from an upcoming (or waiting) `POST /api/pong`
request.

```shell
curl 'http://localhost:5000/api/ping'
```

### GET /api/pong

This will return a message from an upcoming (or waiting) `POST /api/ping`
request.

```shell
curl 'http://localhost:5000/api/pong'
```

### POST /api/ping

This will send the request body to an upcoming (or waiting) `GET /api/pong`
request.

```shell
curl 'http://localhost:5000/api/ping' --data-raw 'PING'
```

### POST /api/pong

This will send the request body to an upcoming (or waiting) `GET /api/ping`
request.

```shell
curl 'http://localhost:5000/api/pong' --data-raw 'PONG'
```

### /other/paths

paths that don't begin with `/api` will return a static response.

```shell
curl 'http://localhost:5000/hello'
# => Hi from /hello
```
