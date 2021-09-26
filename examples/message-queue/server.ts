import { grantOrThrow } from "https://deno.land/std@0.108.0/permissions/mod.ts";
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
  isBroadcastSendMode,
} from "async_channels/broadcast.ts";
import { AbortedError, Channel } from "async_channels/channel.ts";

type Message = { topic: string; payload: Blob };

const router = new Router();

const exchanges = new Map<string, BroadcastChannel<Message, string>>();

interface ExchangeRequestBody {
  name: string;
  sendMode: string;
}
router.post("/api/exchanges", async (ctx: RouterContext) => {
  const body = ctx.request.body();
  ctx.assert(body.type === "json", Status.BadRequest, "JSON body expected");

  const data = await body.value as ExchangeRequestBody;
  ctx.assert(data.name !== undefined, Status.BadRequest);
  ctx.assert(
    !exchanges.has(data.name),
    Status.Conflict,
    "Exchange already exists",
  );
  const sendMode = data.sendMode || "ReturnImmediately";
  if (!isBroadcastSendMode(sendMode)) {
    throw createHttpError(Status.BadRequest, "Invalid sendMode");
  }
  exchanges.set(
    data.name,
    new BroadcastChannel((msg) => msg.topic, {
      sendMode,
      debugExtra: { exchange: data.name },
    }),
  );
  ctx.response.status = Status.Created;
  ctx.response.body = { name: data.name, sendMode };
});

type TopicTuple = [string, string];

const queues = new Map<
  string,
  [Channel<Message>, Map<TopicTuple, () => void>]
>();

interface QueueConf {
  name: string;
  bufferSize?: number;
  topics: TopicTuple[];
}

// Create a Queue
router.post("/api/queues", async (ctx: RouterContext) => {
  const body = ctx.request.body();
  ctx.assert(
    body.type === "json",
    Status.BadRequest,
    "body must be a valid JSON",
  );
  const conf = await body.value as QueueConf;

  ctx.assert(
    conf.name !== undefined,
    Status.BadRequest,
    "missing queue id",
  );

  ctx.assert(
    !queues.has(conf.name),
    Status.Conflict,
    "queue already exists",
  );

  ctx.assert(
    typeof conf === "object",
    Status.BadRequest,
    "body must be a JSON object",
  );

  const ch = new Channel<Message>(conf.bufferSize, {
    debugExtra: { queue: conf.name },
  });
  const unsubscribeFns = new Map(
    conf.topics?.map(([exchangeName, topic]) => {
      return [[exchangeName, topic], subscribe(ch, exchangeName, topic)] as [
        TopicTuple,
        () => void,
      ];
    }),
  );
  queues.set(conf.name, [ch, unsubscribeFns]);

  ctx.response.status = Status.Created;
  ctx.response.body = {
    name: conf.name,
    topics: conf.topics,
    bufferSize: conf.bufferSize,
  };
});

function subscribe(
  ch: Channel<Message>,
  exchangeName: string,
  topic: string,
) {
  const exchange = exchanges.get(exchangeName);
  if (!exchange) return () => {};
  const [sub, unsubscribe] = exchange.subscribe(topic);

  (async () => {
    for await (const msg of sub) {
      await ch.send(msg);
    }
  })().catch((err) => console.error("caught error in subscription loop", err))
    .finally(() => ch.close());

  return unsubscribe;
}

router.put("/api/subscribe/:queue", async (ctx: RouterContext) => {
  const body = ctx.request.body();
  ctx.assert(
    body.type === "json",
    Status.BadRequest,
    "body must be a valid JSON",
  );
  const conf = await body.value as Pick<QueueConf, "topics">;
  ctx.assert(Array.isArray(conf.topics), Status.BadRequest);
  ctx.assert(
    conf.topics.every((x) => Array.isArray(x) && x.length === 2),
    Status.BadRequest,
  );

  ctx.assert(ctx.params.queue !== undefined, Status.BadRequest);
  const maybeQueue = queues.get(ctx.params.queue);
  ctx.assert(maybeQueue, Status.NotFound, "Queue not found");

  const [queue, unsubscribeFns] = maybeQueue;
  for (const [exchangeName, topic] of conf.topics) {
    const exchange = exchanges.get(exchangeName);
    if (!exchange) continue;
    if (unsubscribeFns.has([exchangeName, topic])) continue;
    unsubscribeFns.set(
      [exchangeName, topic],
      subscribe(queue, exchangeName, topic),
    );
  }
  queues.set(ctx.params.queue, [queue, unsubscribeFns]);
});

router.put("/api/unsubscribe/:queue", async (ctx: RouterContext) => {
  const body = ctx.request.body();
  ctx.assert(
    body.type === "json",
    Status.BadRequest,
    "body must be a valid JSON",
  );
  const conf = await body.value as Pick<QueueConf, "topics">;
  ctx.assert(Array.isArray(conf.topics), Status.BadRequest);
  ctx.assert(
    conf.topics.every((x) => Array.isArray(x) && x.length === 2),
    Status.BadRequest,
  );

  ctx.assert(ctx.params.queue !== undefined, Status.BadRequest);
  const maybeQueue = queues.get(ctx.params.queue);
  ctx.assert(maybeQueue, Status.NotFound, "Queue not found");

  const [queue, unsubscribeFns] = maybeQueue;
  for (const [exchangeName, topic] of conf.topics) {
    const unsubscribeFn = unsubscribeFns.get([exchangeName, topic]);
    if (!unsubscribeFn) continue;
    unsubscribeFns.delete([exchangeName, topic]);
    unsubscribeFn();
  }
  queues.set(ctx.params.queue, [queue, unsubscribeFns]);
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

  await exchange.send({ topic: ctx.params.topic, payload: await body.value });

  ctx.response.status = Status.Accepted;
});

// Get a message from the queue.
router.get("/api/queues/:name", async (ctx: RouterContext) => {
  ctx.assert(
    ctx.request.accepts("application/json"),
    Status.UnsupportedMediaType,
  );
  ctx.assert(
    ctx.params.name !== undefined,
    Status.BadRequest,
    "missing queue name",
  );
  const queueTuple = queues.get(ctx.params.name);
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

await grantOrThrow({ name: "env", variable: "MQ_PORT" });
const port = parseInt(Deno.env.get("MQ_PORT") || "8000");

console.log(`Listening on port: ${port}`);
await app.listen({ port });
