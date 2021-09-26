import { logErrCtx } from "./mod.ts";

export const notFound = (ev: Deno.RequestEvent) => {
  return ev.respondWith(
    new Response("Not Found", { status: 404 }),
  ).catch(logErrCtx("notFound"));
};

export const methodNotAllowed = (ev: Deno.RequestEvent) => {
  return ev.respondWith(
    new Response("Method Not Allowed", {
      status: 405,
    }),
  ).catch(logErrCtx("notFound"));
};

export const accepted = (body: BodyInit | null = "Accepted") =>
  (ev: Deno.RequestEvent) => {
    return ev.respondWith(new Response(body, { status: 202 })).catch(
      logErrCtx("notFound"),
    );
  };

export const internalServerError = (body?: BodyInit | null) => {
  return (ev: Deno.RequestEvent) => {
    return ev.respondWith(new Response(body, { status: 500 })).catch(
      logErrCtx("notFound"),
    );
  };
};
