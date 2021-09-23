import { Channel, ChannelOptions, Receiver, select } from "./channel.ts";
import {
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
} from "./internal/utils.ts";

export enum Duration {
  Millisecond = 1,
  Second = Millisecond * 1000,
  Minute = Second * 60,
  Hour = Minute * 60,
}

/**
 * A Ticker holds a channel that delivers “ticks” of a clock at intervals.
 */
export class Ticker {
  readonly #c: Channel<Date>;

  // @ts-ignore strictPropertyInitialization - initialized in constructor using reset().
  protected intervalId: number;

  /**
   * constructs a new `Ticker` containing a channel that will send the time on the channel
   * after each tick. The period of the ticks is specified by the `duration` argument.
   * The ticker will adjust the time interval or drop ticks to make up for slow receivers.
   * The `duration` must be greater than zero; if not, NewTicker will throw.
   * Stop the ticker to release associated resources.
   *
   * @example
   * ```typescript
   * const { Channel, select, time } = await import("./mod.ts");
   * const ticker = new time.Ticker(time.Duration.Second);
   * const done = time.timeout(10 * time.Duration.Second);
   * loop:
   * while (true) {
   *   const res = await select([done, ticker.c]);
   *   switch (res[1]) {
   *     case done:
   *       console.log("Done!");
   *       break loop;
   *     case ticker.c:
   *       console.log(`Current time: ${res[0]}`);
   *   }
   * }
   * ticker.stop();
   * ```
   *
   * @param {number} duration A safe & positive integer.
   * @param {ChannelOptions} [options] Channel options.
   */
  constructor(duration: number, options?: ChannelOptions) {
    this.#c = new Channel<Date>(1, options);
    this.reset(duration);
  }

  /**
   * The channel on which the ticks are delivered.
   */
  get c(): Receiver<Date> {
    return this.#c;
  }

  /**
   * `stop` turns off a ticker. After `stop`, no more ticks will be sent.
   * `stop` does not close the channel, to prevent a concurrent goroutine reading from the
   * channel from seeing an erroneous "tick".
   * @returns
   */
  stop() {
    clearInterval(this.intervalId);
  }

  /**
   * `reset` stops a ticker and resets its period to the specified duration.
   * The next tick will arrive after the new period elapses.
   * @param {number} duration
   */
  reset(duration: number) {
    console.assert(
      isPositiveSafeInteger(duration),
      "duration is a safe & postive integer",
    );
    this.stop();
    this.intervalId = setInterval(() => {
      select([[this.#c, new Date()]], { default: void 0 }).catch();
    }, duration);
  }
}

export class Timer {
  readonly #c: Channel<Date>;
  // @ts-ignore strictPropertyInitialization - initialized in constructor using reset().
  protected ctrl: AbortController;
  // @ts-ignore strictPropertyInitialization - initialized in constructor using reset().
  protected timeoutId: number;

  constructor(duration: number, options?: ChannelOptions) {
    this.#c = new Channel<Date>(1, options);
    this.reset(duration);
  }

  get c(): Receiver<Date> {
    return this.#c;
  }

  /**
   * stop prevents the Timer from firing.
   * It returns true if the call stops the timer, false if the timer has already
   * expired or been stopped.
   * stop does not close the channel, to prevent a read from the channel succeeding
   * incorrectly.
   *
   * To ensure the channel is empty after a call to stop, check the
   * return value and drain the channel.
   * For example, assuming the program has not received from t.C already:
   *
   *     if (!t.stop()) {
   *       await t.c.receive()
   *     }
   *
   * This cannot be done concurrent to other receives from the Timer's
   * channel or other calls to the Timer's stop method.
   *
   * For a timer created with AfterFunc(d, f), if t.stop returns false, then the timer
   * has already expired and the function f has been started in its own goroutine;
   * stop does not wait for f to complete before returning.
   * If the caller needs to know whether f is completed, it must coordinate
   * with f explicitly.
   */
  stop(): boolean {
    if (this.ctrl.signal.aborted) return false;
    this.ctrl.abort();
    clearTimeout(this.timeoutId);
    return true;
  }

  /**
   * `reset` changes the timer to expire after `duration`.
   * It returns `true` if the timer had been active, `false` if the timer had
   * expired or been stopped.
   *
   * reset should be invoked only on stopped or expired timers with drained channels.
   *
   * If a program has already received a value from `t.c`, the timer is known
   * to have expired and the channel drained, so `t.reset()` can be used directly.
   * If a program has not yet received a value from `t.c`, however,
   * the timer must be stopped and—if stop reports that the timer expired
   * before being stopped—the channel explicitly drained:
   *
   *     if (!t.stop()) {
   *       await t.c.receive()
   *     }
   *     t.reset(d)
   *
   * This should not be done concurrent to other receives from the Timer's
   * channel.
   *
   * Note that it is not possible to use reset's return value correctly, as there
   * is a race condition between draining the channel and the new timer expiring.
   * reset should always be invoked on stopped or expired channels, as described above.
   * The return value exists to preserve compatibility with existing programs.
   *
   * @param {number} duration A safe and non-negative integer.
   * @returns
   */
  reset(duration: number): boolean {
    const wasAborted = this.ctrl?.signal.aborted;
    this.ctrl = new AbortController();
    this.timeoutId = setTimeout(() => {
      this.#c.send(new Date(), this.ctrl).catch();
    }, duration);
    return wasAborted;
  }
}

/**
 * `timeout` creates a channel that will close after `duration` milliseconds.
 *
 * @param {number} duration A safe and non-negative integer.
 * @returns {Receiver<void>}
 */
export const timeout = (duration: number): Receiver<void> => {
  console.assert(
    isNonNegativeSafeInteger(duration),
    "duration is a safe non-negative integer",
  );
  const c = new Channel<void>(0);
  setTimeout(() => c.close(), duration);
  return c;
};
