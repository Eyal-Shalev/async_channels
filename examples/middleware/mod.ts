import {
  BroadcastChannel,
  Channel,
  ChannelOptions,
  Receiver,
} from "async_channels";

export const requestMethod = (ev: Deno.RequestEvent) => ev.request.method;
export const pathPart = <T extends { pathParts: string[] }>(index: number) => (
  ({ pathParts }: T) => pathParts[index]
);

export const logErr = console.error.bind(console);
export const logErrCtx = (...ctx: unknown[]) =>
  (...args: unknown[]) => logErr(...ctx, ...args);

export type ListenOptions = Deno.ListenOptions & { transport?: "tcp" };

export function application(
  channelOpts?: ChannelOptions & { bufferSize?: number },
): [Receiver<Deno.RequestEvent>, (opts: ListenOptions) => Promise<void>] {
  const { bufferSize, ...opts } = channelOpts ?? {};
  const appCh = new Channel<Deno.RequestEvent>(bufferSize, opts);
  return [appCh, listenAndServe];

  async function listenAndServe(listenOpts: ListenOptions) {
    await Channel.from(Deno.listen(listenOpts)).forEach((conn) => {
      Channel.from(Deno.serveHttp(conn)).forEach((ev) => {
        appCh.send(ev)
          .catch(logErrCtx("send(Deno.RequestEvent)", ev));
      }).receive().catch(logErrCtx("Deno.serveHttp(conn)", conn));
    }).receive().catch(logErrCtx("Deno.listen(options)", listenOpts));
    appCh.close();
  }
}

export const other = Symbol("other");
export function subscribe<TMsg>(
  fn: (_: TMsg) => string | number | symbol,
  ...topics: (string | number | symbol)[]
) {
  return (
    ch: Receiver<TMsg>,
  ): Record<string | number | symbol, Receiver<TMsg>> => {
    const broadcastCh = BroadcastChannel.from(ch, fn);

    return {
      [other]: broadcastCh.subscribe((topic) => !topics.includes(topic))[0],
      ...Object.fromEntries(topics.map((topic) => {
        return [topic, broadcastCh.subscribe(topic)[0]];
      })),
    };
  };
}
