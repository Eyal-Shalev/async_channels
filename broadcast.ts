import {
  Channel,
  ChannelOptions,
  Closer,
  Receiver,
  SendCloser,
  Sender,
} from "./channel.ts";
import { select, SelectOperation } from "./select.ts";

export interface Subscribable<TMsg, TTopic> {
  subscribe(topic: TTopic): [Receiver<TMsg>, () => void];
}

type TopicFn<T> = (topic: T) => boolean;

function isTopicFn<T>(x: T | TopicFn<T>): x is TopicFn<T> {
  return typeof x === "function";
}

export type BroadcastSendMode =
  | "WaitForAll"
  | "WaitForOne"
  | "ReturnImmediately";

export function isBroadcastSendMode(x: unknown): x is BroadcastSendMode {
  return ([
    "WaitForAll",
    "WaitForOne",
    "ReturnImmediately",
  ] as unknown[]).includes(x);
}

interface BroadcastChannelOptions extends ChannelOptions {
  sendMode: BroadcastSendMode;
}

export const DefaultBroadcastChannelOptions: BroadcastChannelOptions = {
  sendMode: "ReturnImmediately",
};

export class BroadcastChannel<TMsg, TTopic>
  implements Sender<TMsg>, Closer, Subscribable<TMsg, TTopic> {
  protected subscribers = new Map<TTopic | symbol, Set<SendCloser<TMsg>>>();
  protected fnSubscribers = new Map<TopicFn<TTopic>, Set<SendCloser<TMsg>>>();
  protected readonly options: BroadcastChannelOptions;

  #isOpen = true;
  public get isOpen() {
    return this.#isOpen;
  }

  constructor(
    protected readonly topicFn: (val: TMsg) => TTopic,
    options = DefaultBroadcastChannelOptions,
  ) {
    this.options = { ...DefaultBroadcastChannelOptions, ...options };
  }

  async send(msg: TMsg, abortCtrl?: AbortController): Promise<void> {
    const topic = this.topicFn(msg);

    const targets: SendCloser<TMsg>[] = [];

    for (const [fn, fnTargets] of this.fnSubscribers) {
      if (!fn(topic)) continue;
      for (const target of fnTargets) targets.push(target);
    }

    for (const target of (this.subscribers.get(topic) || [])) {
      targets.push(target);
    }

    switch (this.options.sendMode) {
      case "ReturnImmediately":
        for (const target of targets) {
          await select([[target, msg]], { default: void 0, abortCtrl });
        }
        return;
      case "WaitForOne":
        console.assert(
          targets.length > 1,
          "BroadcastChannel has at least 1 subscriber",
        );
        await select(
          targets.map((target) => [target, msg] as SelectOperation<TMsg>),
          { abortCtrl },
        );
        return;
      case "WaitForAll": {
        await Promise.all(targets.map((target) => {
          const targetAbortCtrl = abortCtrl && new AbortController();
          abortCtrl?.signal.addEventListener(
            "abort",
            () => targetAbortCtrl?.abort(),
          );
          return target.send(msg, targetAbortCtrl);
        }));
        return;
      }
    }
  }

  subscribe(topic: TTopic | TopicFn<TTopic>): [Receiver<TMsg>, () => void] {
    if (!this.isOpen) {
      throw new TypeError("Cannot subscribe to a closed BroadcastChannel");
    }

    const options = {
      debugExtra: { topic, ...this.options?.debugExtra },
      ...this.options,
    };

    const ch = new Channel<TMsg>(0, options);

    if (isTopicFn(topic)) {
      if (!this.fnSubscribers.has(topic)) {
        this.fnSubscribers.set(topic, new Set());
      }
      this.fnSubscribers.get(topic)?.add(ch);
      const unsubscribe = () => {
        this.fnSubscribers.get(topic)?.delete(ch);
      };
      return [ch, unsubscribe];
    }

    if (!this.subscribers.has(topic)) this.subscribers.set(topic, new Set());
    this.subscribers.get(topic)?.add(ch);
    const unsubscribe = () => {
      this.subscribers.get(topic)?.delete(ch);
      ch.close();
    };
    return [ch, unsubscribe];
  }

  close() {
    this.#isOpen = false;
    this.subscribers.forEach((channels) => {
      channels.forEach((ch) => {
        ch.close();
      });
    });
  }
}
