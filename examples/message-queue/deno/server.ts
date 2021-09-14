import { createHttpError } from "https://deno.land/x/oak@v9.0.0/httpError.ts";
import {
  Application,
  NativeRequest,
  Router,
  RouterContext,
  Status,
} from "https://deno.land/x/oak@v9.0.0/mod.ts";
import {
  BroadcastChannel,
  BroadcastSendModes,
  isBroadcastSendMode,
} from "../../../broadcast.ts";
import { AbortedError, Channel } from "../../../channel.ts";

type Message = Record<string, unknown> & { event?: string } & { topic: string };

const router = new Router();

const exchanges = new Map<string, BroadcastChannel<Message, string>>();

router.post("/api/exchanges/:exchange", async (ctx: RouterContext) => {
  ctx.assert(ctx.params.exchange !== undefined, Status.BadRequest);
  ctx.assert(
    !exchanges.has(ctx.params.exchange),
    Status.Conflict,
    "Exchange already exists",
  );
  const body = ctx.request.body();
  ctx.assert(body.type === "json", Status.BadRequest, "JSON body expected");
  const data = await body.value;
  const sendMode = data.sendMode || BroadcastSendModes.ReturnImmediately;
  if (!isBroadcastSendMode(sendMode)) {
    throw createHttpError(Status.BadRequest, "Invalid sendMode");
  }
  exchanges.set(ctx.params.exchange, new BroadcastChannel((msg) => msg.topic));
  ctx.response.status = Status.Accepted;
});

const queues = new Map<
  string,
  [Channel<Message>, Record<string, () => void>]
>();

interface QueueConf {
  bufferSize?: number;
  topics: [string, string][];
}

// Create a Queue
router.post("/api/queue/:id", async (ctx: RouterContext) => {
  ctx.assert(
    ctx.params.id !== undefined,
    Status.BadRequest,
    "missing queue id",
  );

  ctx.assert(
    !queues.has(ctx.params.id),
    Status.Conflict,
    "queue already exists",
  );

  const body = ctx.request.body();
  ctx.assert(
    body.type === "json",
    Status.BadRequest,
    "body must be a valid JSON",
  );

  const conf = await body.value as QueueConf;
  ctx.assert(
    typeof conf === "object",
    Status.BadRequest,
    "body must be a JSON object",
  );

  const ch = new Channel<Message>(conf.bufferSize);
  const unsubscribeFns = Object.fromEntries(
    conf.topics?.map(([exchangeId, topic]) => {
      const exchange = exchanges.get(exchangeId);
      if (!exchange) return [topic, () => {}];
      const [sub, unsubscribe] = exchange.subscribe(topic);
      sub.forEach((msg) => ch.send(msg));
      return [topic, unsubscribe] as [string, () => void];
    }),
  );
  queues.set(ctx.params.id, [ch, unsubscribeFns]);

  ctx.response.status = Status.Accepted;
});

// Send a message on a topic.
router.put("/api/topics/:exchange/:topic", async (ctx: RouterContext) => {
  ctx.assert(ctx.params.topic !== undefined, Status.BadRequest);
  ctx.assert(ctx.params.exchange !== undefined, Status.BadRequest);

  const exchange = exchanges.get(ctx.params.exchange);
  ctx.assert(
    exchange !== undefined,
    Status.NotFound,
    "No exchange found with that identifier.",
  );

  const body = ctx.request.body();

  ctx.assert(body.type === "json", Status.BadRequest);

  const msg = await body.value;
  ctx.assert(typeof msg === "object", Status.BadRequest);
  await exchange.send({ topic: ctx.params.topic, ...msg });

  ctx.response.status = Status.Accepted;
});

// Get a message from the queue.
router.get("/api/queue/:id", async (ctx: RouterContext) => {
  ctx.assert(
    ctx.request.accepts("application/json"),
    Status.UnsupportedMediaType,
  );
  ctx.assert(
    ctx.params.id !== undefined,
    Status.BadRequest,
    "missing queue ID",
  );
  const queueTuple = queues.get(ctx.params.id);
  ctx.assert(
    queueTuple,
    Status.NotFound,
    "Queue not found",
  );

  const ctrl = new AbortController();
  (ctx.request.originalRequest as NativeRequest).donePromise.then(() => {
    ctrl.abort();
  });

  const [queue] = queueTuple;

  try {
    const [msg, ok] = await queue.receive(ctrl);
    ctx.assert(ok, Status.Gone, "queue is closed");

    ctx.response.body = JSON.stringify(msg);
  } catch (e) {
    if (!(e instanceof AbortedError)) {
      throw createHttpError(
        Status.InternalServerError,
        e instanceof Error ? e.message : String(e),
      );
    }
    console.log("client aborted");
  }

  ctx.response.status = Status.Accepted;
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());
await app.listen({ port: 8000 });
