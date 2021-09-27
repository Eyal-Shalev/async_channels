import {
  Channel,
  ChannelOptions,
  Closer,
  Receiver,
  Sender,
} from "./channel.ts";
import { ignoreAbortedError, makeAbortCtrl } from "./internal/utils.ts";
import { ChannelPipeOptions } from "./pipe.ts";
import { select, SelectOperation } from "./select.ts";

type SendCloser<T> = Sender<T> & Closer;

export type Subscribable<TMsg, TTopic> = Pick<
  BroadcastChannel<TMsg, TTopic>,
  "subscribe" | "subscribeFn"
>;

type TopicFn<T> = (topic: T) => boolean;

export type BroadcastSendMode =
  | "WaitForAll"
  | "WaitForOne"
  | "ReturnImmediately";

export const defaultBroadcastSendMode: BroadcastSendMode = "ReturnImmediately";

export function isBroadcastSendMode(x: unknown): x is BroadcastSendMode {
  return ([
    "WaitForAll",
    "WaitForOne",
    "ReturnImmediately",
  ] as unknown[]).includes(x);
}

export type BroadcastSubscribeOptions = Omit<ChannelPipeOptions, "signal">;

export interface BroadcastChannelOptions extends ChannelOptions {
  sendMode?: BroadcastSendMode;
}
export type BroadcastChannelPipeOptions =
  & BroadcastChannelOptions
  & Omit<ChannelPipeOptions, "bufferSize">;

export class BroadcastChannel<TMsg, TTopic> implements SendCloser<TMsg> {
  protected subscribers = new Map<
    [TTopic, "topic"] | [TopicFn<TTopic>, "topicFn"],
    Set<SendCloser<TMsg>>
  >();
  protected readonly options: BroadcastChannelOptions;

  #isOpen = true;
  public get isOpen() {
    return this.#isOpen;
  }

  constructor(
    protected readonly topicFn: (val: TMsg) => TTopic,
    options?: BroadcastChannelOptions,
  ) {
    const { sendMode, ...chanOpts } = options ?? {};
    this.options = {
      ...chanOpts,
      sendMode: sendMode ?? defaultBroadcastSendMode,
    };
  }

  static from<TMsg, TTopic>(
    input: Iterable<TMsg> | AsyncIterable<TMsg>,
    topicFn: (val: TMsg) => TTopic,
    pipeOpts?: BroadcastChannelPipeOptions,
  ): Subscribable<TMsg, TTopic> {
    const { signal, ...options } = pipeOpts ?? {};
    const outChan = new BroadcastChannel<TMsg, TTopic>(topicFn, options);

    (async () => {
      for await (const item of input) {
        await outChan.send(item, makeAbortCtrl(signal));
      }
    })().catch(ignoreAbortedError)
      .catch((err) => outChan.error("BroadcastChannel.from", err))
      .finally(() => outChan.close());

    return outChan;
  }

  async send(msg: TMsg, abortCtrl?: AbortController): Promise<void> {
    const topic = this.topicFn(msg);

    const targets: SendCloser<TMsg>[] = [];

    for (const [tuple, tupleTargets] of this.subscribers) {
      if (tuple[1] === "topic" && tuple[0] !== topic) continue;
      if (tuple[1] === "topicFn" && !tuple[0](topic)) continue;
      tupleTargets.forEach((target) => targets.push(target));
    }

    switch (this.options.sendMode) {
      case "ReturnImmediately":
        for (const target of targets) {
          await select([[target, msg]], { default: void 0, abortCtrl });
        }
        return;
      case "WaitForOne":
        if (targets.length === 0) {
          throw new Error(
            "sending on BroadcastChannel (WaitForOne) requires at least 1 subscriber",
          );
        }
        await select(
          targets.map((target) => [target, msg] as SelectOperation<TMsg>),
          { abortCtrl },
        );
        return;
      case "WaitForAll":
        await Promise.all(targets.map((target) => {
          return target.send(msg, makeAbortCtrl(abortCtrl?.signal));
        }));
        return;
      default:
        throw new TypeError(
          `${this.options.sendMode} is not a valid BroadcastChannel sendMode`,
        );
    }
  }

  protected doSubscribe(
    tuple: [TopicFn<TTopic>, "topicFn"] | [TTopic, "topic"],
    subOpts?: BroadcastSubscribeOptions,
  ): [Receiver<TMsg>, () => void] {
    if (!this.isOpen) {
      throw new TypeError("Cannot subscribe to a closed BroadcastChannel");
    }

    const { bufferSize, debugExtra, ...options } = subOpts ?? {};

    const ch = new Channel<TMsg>(bufferSize, {
      ...options,
      debugExtra: { [tuple[1]]: tuple[0], ...debugExtra },
    });

    if (!this.subscribers.has(tuple)) {
      this.subscribers.set(tuple, new Set());
    }
    this.subscribers.get(tuple)?.add(ch);
    const unsubscribe = () => {
      this.subscribers.get(tuple)?.delete(ch);
      ch.close();
    };

    return [ch, unsubscribe];
  }

  subscribeFn(
    topicFn: TopicFn<TTopic>,
    subOpts?: BroadcastSubscribeOptions,
  ): [Receiver<TMsg>, () => void] {
    return this.doSubscribe([topicFn, "topicFn"], subOpts);
  }

  subscribe(
    topic: TTopic,
    subOpts?: BroadcastSubscribeOptions,
  ): [Receiver<TMsg>, () => void] {
    return this.doSubscribe([topic, "topic"], subOpts);
  }

  close() {
    this.#isOpen = false;
    this.subscribers.forEach((channels) => {
      channels.forEach((ch) => {
        ch.close();
      });
    });
  }

  error(...args: unknown[]) {
    console.error(...args, {
      topicFn: this.topicFn,
      ...(this.options?.debugExtra ?? {}),
    });
  }

  debug(...args: unknown[]) {
    if (this.options?.debug) {
      console.debug(...args, {
        topicFn: this.topicFn,
        ...(this.options?.debugExtra ?? {}),
      });
    }
  }
}
