import { Channel, ChannelOptions, Receiver } from "./channel.ts";

export type MergeOptions = ChannelOptions & { bufferSize?: number };
export function merge(
  inChans: [],
  options?: MergeOptions,
): never;
export function merge(
  inChans: [Receiver<unknown>],
  options?: MergeOptions,
): never;
export function merge<T1, T2>(
  inChans: [
    Receiver<T1>,
    Receiver<T2>,
  ],
  options?: MergeOptions,
): Receiver<T1 | T2>;
export function merge<T1, T2, T3>(
  inChans: [
    Receiver<T1>,
    Receiver<T2>,
    Receiver<T3>,
  ],
  options?: MergeOptions,
): Receiver<T1 | T2 | T3>;
/**
 * Takes a collection of source channels and returns a channel
 * which contains all values taken from them.
 *
 * @template T
 * @param {Receiver<T>[]} inChans
 * @param {MergeOptions} [options={}]
 * @returns {Receiver<T>}
 */
export function merge<T>(
  inChans: Receiver<T>[],
  options: MergeOptions = {},
): Receiver<T> {
  if (inChans.length < 2) {
    throw new TypeError("cannot merge less than 2 channels");
  }
  const { bufferSize, ...chOpts } = options;
  const outChan = new Channel<T>(bufferSize, chOpts);

  Promise.all(inChans.map((inChan) =>
    (async () => {
      for await (const current of inChan) {
        await outChan.send(current);
      }
    })()
  )).catch((err) => console.error("merge", err))
    .finally(() => outChan.close());

  return outChan;
}
