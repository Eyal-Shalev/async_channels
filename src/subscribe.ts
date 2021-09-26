import { BroadcastChannel, BroadcastChannelOptions } from "./broadcast.ts";
import { Receiver } from "./channel.ts";
import { ChannelPipeOptions } from "./pipe.ts";

export const otherTopics: unique symbol = Symbol("other");

export type SubscribeOptions =
  & BroadcastChannelOptions
  & Omit<ChannelPipeOptions, "signal">;

export type SubscribeReturnType<TMsg, TObj> =
  & { [r in keyof TObj]: Receiver<TMsg> }
  & { [otherTopics]: Receiver<TMsg> };

export function subscribe<TMsg, TObj>(
  fn: (_: TMsg) => string | symbol | number,
  topics: (keyof TObj)[],
  pipeOpts?: SubscribeOptions,
) {
  return (ch: Receiver<TMsg>): SubscribeReturnType<TMsg, TObj> => {
    const { bufferSize: tmpBufferSize, sendMode, ...commonOpts } = pipeOpts ??
      {};

    const bufferSize = tmpBufferSize ?? ch.bufferSize;

    const broadcastCh = BroadcastChannel.from(ch, fn, {
      ...commonOpts,
      sendMode,
    });

    const [otherSub] = broadcastCh.subscribeFn(
      (topic) => !(topics as unknown[]).includes(topic),
      { ...commonOpts, bufferSize },
    );

    const topicSubs = Object.fromEntries(
      topics.map((topic) => {
        return [
          topic,
          broadcastCh.subscribe(topic, { ...commonOpts, bufferSize })[0],
        ];
      }),
    ) as { [r in keyof TObj]: Receiver<TMsg> };

    return { [otherTopics]: otherSub, ...topicSubs };
  };
}
