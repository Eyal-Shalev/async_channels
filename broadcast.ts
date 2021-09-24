import {
  Channel,
  ChannelOptions,
  ChannelPipeOptions,
  Closer,
  Receiver,
  Sender,
} from "./channel.ts";
import { ignoreAbortedError, makeAbortCtrl } from "./internal/utils.ts";
import { select, SelectOperation } from "./select.ts";

type SendCloser<T> = Sender<T> & Closer;

export type Subscribable<TMsg, TTopic> = Pick<
  BroadcastChannel<TMsg, TTopic>,
  "subscribe"
>;

type TopicFn<T> = (topic: T) => boolean;

function isTopicFn<T>(x: T | TopicFn<T>): x is TopicFn<T> {
  return typeof x === "function";
}

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

export interface BroadcastChannelOptions extends ChannelOptions {
  sendMode?: BroadcastSendMode;
}
export type BroadcastChannelPipeOptions =
  & BroadcastChannelOptions
  & Omit<ChannelPipeOptions, "bufferSize">;

export class BroadcastChannel<TMsg, TTopic> {
  protected subscribers = new Map<TTopic | symbol, Set<SendCloser<TMsg>>>();
  protected fnSubscribers = new Map<TopicFn<TTopic>, Set<SendCloser<TMsg>>>();
  protected readonly options: BroadcastChannelOptions;

  #isOpen = true;
  public get isOpen() {
    return this.#isOpen;
  }

  constructor(
    protected readonly topicFn: (val: TMsg) => TTopic,
    options?: BroadcastChannelOptions,
  ) {
    this.options = { sendMode: defaultBroadcastSendMode, ...(options ?? {}) };
  }

  with<T>(fn: (t: typeof this) => T): T {
    return fn(this);
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

  subscribe(
    topic: TTopic | TopicFn<TTopic>,
  ): [Receiver<TMsg>, () => void] {
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

  protected error(...args: unknown[]) {
    console.error(...args, {
      topicFn: this.topicFn,
      ...(this.options?.debugExtra ?? {}),
    });
  }

  protected debug(...args: unknown[]) {
    if (this.options?.debug) {
      console.debug(...args, {
        topicFn: this.topicFn,
        ...(this.options?.debugExtra ?? {}),
      });
    }
  }
}
