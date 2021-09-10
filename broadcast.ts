import {
  Channel,
  ChannelOptions,
  Closer,
  Receiver,
  select,
  SendCloser,
  Sender,
} from "./channel.ts";

type Foo<TMsg, TTopic> = Omit<Broadcaster<TMsg, TTopic>, "send">;

export interface Subscribable<TMsg, TTopic> {
  subscribe(topic: TTopic): Receiver<TMsg>;
}

export class Broadcaster<TMsg, TTopic>
  implements Sender<TMsg>, Closer, Subscribable<TMsg, TTopic> {
  protected subscribers = new Map<TTopic, Set<SendCloser<TMsg>>>();

  #isOpen = true;
  public get isOpen() {
    return this.#isOpen;
  }

  constructor(
    protected readonly topicFn: (val: TMsg) => TTopic,
    protected readonly options?: ChannelOptions,
  ) {}

  static from<TMsg, TTopic>(
    input: AsyncIterable<TMsg> | Iterable<TMsg>,
    topicFn: (val: TMsg) => TTopic,
    options?: ChannelOptions,
  ): Subscribable<TMsg, TTopic> {
    const bcast = new Broadcaster<TMsg, TTopic>(topicFn, options);

    (async () => {
      for await (const msg of input) {
        await bcast.send(msg);
      }
      bcast.close();
    })();

    return bcast;
  }

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
