import {
  accepted,
  internalServerError,
  methodNotAllowed,
  notFound,
} from "./respondWith.ts";
import {
  addPathParts,
  addUrl,
  application,
  pathPart,
  requestMethod,
} from "./mod.ts";
import { subscribe } from "async_channels";

const [rootCh, listenAndServe] = application({ bufferSize: 10 });

// Create a new channel that consumes rootCh and enriches each
// message from it with a (parsed) url property a split path parts property.
const enrichedRootCh = rootCh.map(addUrl).map(addPathParts);

// apiCh is subscribed to all requests that start with /api.
// staticCh is subscribed to all other requests.
const {
  api: apiCh,
  [subscribe.other]: staticCh,
} = enrichedRootCh.with(subscribe(pathPart(1), ["api"]));

// Consume all messages from staticCh and respond to them with a custom greeting.
staticCh.forEach((ev) => {
  ev.respondWith(new Response(`Hi from ${ev.url.pathname}`));
});

// pingCh & pongCh are subscribed to all requests that start with /api/ping and
// /api/pong (respectfully).
// otherApiCh is subscribed to all other requests.
const {
  ping: pingCh,
  pong: pongCh,
  [subscribe.other]: otherApiCh,
} = apiCh.with(subscribe(pathPart(2), ["ping", "pong"]));

// Consume all messages from otherApiCh and respond to all of them with a not
// found response.
otherApiCh.forEach(notFound);

// Subscribe to the GET & POST methods for both pingCh and pongCh.
const {
  GET: pingGetCh,
  POST: pingPostCh,
  [subscribe.other]: pingOtherCh,
} = pingCh.with(subscribe(requestMethod, ["GET", "POST"]));
const {
  GET: pongGetCh,
  POST: pongPostCh,
  [subscribe.other]: pongOtherCh,
} = pongCh.with(subscribe(requestMethod, ["GET", "POST"]));

// Respond with method not allowed for all requests to these apis under different
// request methods.
pingOtherCh.forEach(methodNotAllowed);
pongOtherCh.forEach(methodNotAllowed);

// pingMsgsCh contains a channel, that when consumed will read the request body
// (from pingPostCh) as a blob, send an accepted response to the request from
// pingPostCh, and return the blob.
const pingMsgsCh = pingPostCh.map(async (ev) => {
  const blob = await ev.request.blob();
  accepted()(ev);
  return blob;
});

// For each pong GET request, respond with a message that was consumed from pingMsgsCh.
pongGetCh.forEach(async (ev) => {
  const [blob] = await pingMsgsCh.receive();
  if (blob) ev.respondWith(new Response(blob));
  else internalServerError("ping channel closed")(ev);
});

// pongMsgsCh contains a channel, that when consumed will read the request body
// (from pongPostCh) as a blob, send an accepted response to the request from
// pongPostCh, and return the blob.
const pongMsgsCh = pongPostCh.map(async (ev) => {
  const blob = await ev.request.blob();
  accepted()(ev);
  return blob;
});

// For each ping GET request, respond with a message that was consumed from pongMsgsCh.
pingGetCh.forEach(async (ev) => {
  const [blob] = await pongMsgsCh.receive();
  if (blob) ev.respondWith(new Response(blob));
  else internalServerError("ping channel closed")(ev);
});

// Wait endlessly for connections to start the above pipeline.
await listenAndServe({ port: 5000 });
