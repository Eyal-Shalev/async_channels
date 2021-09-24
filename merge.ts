import { Channel, ClosedReceiver, Receiver } from "./channel.ts";
import { ignoreAbortedError, makeAbortCtrl } from "./internal/utils.ts";
import { ChannelPipeOptions } from "./pipe.ts";

export function merge(
  inChans: [],
  options?: ChannelPipeOptions,
): ClosedReceiver;
export function merge<T>(
  inChans: [Receiver<T>],
  options?: ChannelPipeOptions,
): Receiver<T>;
export function merge<T1 = unknown, T2 = T1>(
  inChans: [
    Receiver<T1>,
    Receiver<T2>,
  ],
  options?: ChannelPipeOptions,
): Receiver<T1 | T2>;
export function merge<T1 = unknown, T2 = T1, T3 = T2>(
  inChans: [
    Receiver<T1>,
    Receiver<T2>,
    Receiver<T3>,
  ],
  options?: ChannelPipeOptions,
): Receiver<T1 | T2 | T3>;
export function merge<T>(
  inChans: Receiver<T>[],
  options?: ChannelPipeOptions,
): Receiver<T>;
/**
 * Takes a collection of source channels and returns a channel
 * which contains all values taken from them.
 *
 * @template T
 * @param {Receiver<T>[]} inChans
 * @param {ChannelPipeOptions} [options={}]
 * @returns {Receiver<T>}
 */
export function merge<T>(
  inChans: Receiver<T>[],
  mergeOpts: ChannelPipeOptions = {},
): Receiver<T> {
  const { signal, ...options } = mergeOpts;
  const { bufferSize, ...chOpts } = options;
  const outChan = new Channel<T>(bufferSize, chOpts);

  Promise.all(inChans.map((inChan) =>
    (async () => {
      for await (const current of inChan) {
        await outChan.send(current, makeAbortCtrl(signal));
      }
    })()
  )).catch(ignoreAbortedError)
    .catch((err) => console.error("merge", err))
    .finally(() => outChan.close());

  return outChan;
}
