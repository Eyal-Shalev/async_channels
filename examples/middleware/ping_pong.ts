import {
  accepted,
  internalServerError,
  methodNotAllowed,
  notFound,
} from "./respondWith.ts";
import {
  application,
  other,
  pathPart,
  requestMethod,
  subscribe,
} from "./mod.ts";

const [appCh, listenAndServe] = application({ bufferSize: 10 });

const {
  api: apiCh,
  [other]: staticCh,
} = appCh
  .map((ev) => ({ ...ev, url: new URL(ev.request.url) }))
  .map((ev) => ({ ...ev, pathParts: ev.url.pathname.split("/") }))
  .with(subscribe(pathPart(1), "api"));

staticCh.forEach((ev) => {
  ev.respondWith(new Response(`Hi ${ev.url.pathname}`));
});

const {
  ping: pingCh,
  pong: pongCh,
  [other]: otherCh,
} = apiCh.with(subscribe(pathPart(2), "ping", "pong"));

otherCh.forEach(notFound);

const {
  GET: pingGetCh,
  POST: pingPostCh,
  [other]: pingOtherCh,
} = pingCh.with(subscribe(requestMethod, "GET", "POST"));
pingOtherCh.forEach(methodNotAllowed);

const {
  GET: pongGetCh,
  POST: pongPostCh,
  [other]: pongOtherCh,
} = pongCh.with(subscribe(requestMethod, "GET", "POST"));
pongOtherCh.forEach(methodNotAllowed);

const pingMsgsCh = pingPostCh.map(async (ev) => {
  const blob = await ev.request.blob();
  accepted()(ev);
  return blob;
});
pongGetCh.map(async (ev) => {
  const [blob] = await pingMsgsCh.receive();
  if (blob) ev.respondWith(new Response(blob));
  else internalServerError("ping channel closed")(ev);
});

const pongMsgsCh = pongPostCh.map(async (ev) => {
  const blob = await ev.request.blob();
  accepted()(ev);
  return blob;
});
pingGetCh.map(async (ev) => {
  const [blob] = await pongMsgsCh.receive();
  if (blob) ev.respondWith(new Response(blob));
  else internalServerError("ping channel closed")(ev);
});

await listenAndServe({ port: 5000 });
