import { BroadcastChannel, Channel } from "async_channels";
import {
  accepted,
  internalServerError,
  methodNotAllowed,
  notFound,
} from "./respondWith.ts";
const requestMethod = (ev: Deno.RequestEvent) => ev.request.method;
const pathPart = (index: number) =>
  ({ pathParts }: { pathParts: string[] }) => pathParts[index];

const port = 5000;
const bufferSize = 10;

const evChan = new Channel<Deno.RequestEvent>(bufferSize);

const a = evChan.map((ev) => ({ ...ev, url: new URL(ev.request.url) }))
  .map((ev) => ({ ...ev, pathParts: ev.url.pathname.split("/") }))
  .with((ch) => BroadcastChannel.from(ch, pathPart(1)));

const [apiCh] = a.subscribe("api");
const [staticCh] = a.subscribe((part) => part !== "api");
staticCh.forEach((ev) => {
  ev.respondWith(new Response(`Hello from ${ev.url.pathname}`));
});

const {
  ping: pingCh,
  pong: pongCh,
  other: otherCh,
} = BroadcastChannel.from(apiCh, (ev) => ev.pathParts[2]).with((b) => ({
  ping: b.subscribe("ping")[0],
  pong: b.subscribe("pong")[0],
  other: b.subscribe((part) => !["ping", "pong"].includes(part))[0],
}));
otherCh.forEach(notFound);

const {
  GET: pingGetCh,
  POST: pingPostCh,
  other: pingOtherCh,
} = BroadcastChannel.from(pingCh, requestMethod).with((b) => ({
  GET: b.subscribe("GET")[0],
  POST: b.subscribe("POST")[0],
  other: b.subscribe((method) => !["GET", "POST"].includes(method))[0],
}));
pingOtherCh.forEach(methodNotAllowed);

const {
  GET: pongGetCh,
  POST: pongPostCh,
  other: pongOtherCh,
} = BroadcastChannel.from(pongCh, requestMethod).with((b) => ({
  GET: b.subscribe("GET")[0],
  POST: b.subscribe("POST")[0],
  other: b.subscribe((method) => !["GET", "POST"].includes(method))[0],
}));
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

const logErr = console.error.bind(console);
const logErrCtx = (...ctx: unknown[]) =>
  (...args: unknown[]) => logErr(...ctx, ...args);

await Channel.from(Deno.listen({ port })).forEach((conn) => {
  Channel.from(Deno.serveHttp(conn)).forEach((ev) => {
    evChan.send(ev).catch(logErrCtx("evChan.send(Deno.RequestEvent)", ev));
  }).receive().catch(logErrCtx("Deno.serveHttp(conn)", conn));
}).receive().catch(logErrCtx("Deno.listen({port})", port));
