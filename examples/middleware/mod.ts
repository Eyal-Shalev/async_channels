import { Channel, ChannelOptions, Receiver } from "async_channels";

export const addUrl = (ev: Deno.RequestEvent) => ({
  ...ev,
  url: new URL(ev.request.url),
});
export const addPathParts = (ev: Deno.RequestEvent & { url: URL }) => ({
  ...ev,
  pathParts: ev.url.pathname.split("/"),
});

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
    try {
      await Channel.from(Deno.listen(listenOpts)).forEach((conn) => {
        Channel.from(Deno.serveHttp(conn)).forEach((ev) => {
          appCh.send(ev)
            .catch(logErrCtx("send(Deno.RequestEvent)", ev));
        }).receive().catch(logErrCtx("Deno.serveHttp(conn)", conn));
      }).receive().catch(logErrCtx("Deno.listen(options)", listenOpts));
      appCh.close();
    } catch (e) {
      logErr("listenAndServe(options)", listenOpts, e);
    }
  }
}
