import { BroadcastChannel, BroadcastChannelPipeOptions } from "./broadcast.ts";
import { Receiver } from "./channel.ts";

export const other = Symbol("other");
export function subscribe<TMsg>(
  fn: (_: TMsg) => string | number | symbol,
  topics: (string | number | symbol)[],
  options?: BroadcastChannelPipeOptions,
) {
  return (
    ch: Receiver<TMsg>,
  ): Record<string | number | symbol, Receiver<TMsg>> => {
    const broadcastCh = BroadcastChannel.from(ch, fn, options);

    return {
      [other]: broadcastCh.subscribeFn((topic) => !topics.includes(topic))[0],
      ...Object.fromEntries(topics.map((topic) => {
        return [topic, broadcastCh.subscribe(topic)[0]];
      })),
    };
  };
}

export default Object.assign(subscribe, { other });
