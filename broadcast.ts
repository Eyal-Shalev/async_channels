import {
  Channel,
  ChannelOptions,
  Closer,
  Receiver,
  select,
  SendCloser,
  Sender,
} from "./channel.ts";

export class Broadcaster<TMsg, TTopic> implements Sender<TMsg>, Closer {
  protected subscribers = new Map<TTopic, Set<SendCloser<TMsg>>>();

  #isOpen = true;
  public get isOpen() {
    return this.#isOpen;
  }

  constructor(
    protected readonly topicFn: (val: TMsg) => TTopic,
    protected readonly options?: ChannelOptions,
  ) {}

  async send(msg: TMsg): Promise<void> {
    const targets = this.subscribers.get(this.topicFn(msg));
    if (!targets) return;
    for (const target of targets) {
      await select([[target, msg]], { default: void 0 });
    }
  }

  subscribe(topic: TTopic): Receiver<TMsg> {
    if (!this.isOpen) {
      throw new TypeError("Cannot subscribe to a closed Broadcaster");
    }

    const options = {
      debugExtra: { topic, ...this.options?.debugExtra },
      ...this.options,
    };

    const ch = new Channel<TMsg>(0, options);
    if (!this.subscribers.has(topic)) this.subscribers.set(topic, new Set());
    this.subscribers.get(topic)?.add(ch);
    return ch;
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
