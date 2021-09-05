import { Channel, Receiver } from "./channel.ts";

export class Timer {
  readonly #c = new Channel<Date>(1);
  // @ts-ignore strictPropertyInitialization - initialized in Timer.reset
  protected ctrl: AbortController;
  // @ts-ignore strictPropertyInitialization - initialized in Timer.reset
  protected timeoutId: number;

  constructor(duration: number) {
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
   *       t.c.receive()
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
   * reset changes the timer to expire after duration d.
   * It returns true if the timer had been active, false if the timer had
   * expired or been stopped.
   *
   * For a Timer created with NewTimer, reset should be invoked only on
   * stopped or expired timers with drained channels.
   *
   * If a program has already received a value from t.C, the timer is known
   * to have expired and the channel drained, so t.reset can be used directly.
   * If a program has not yet received a value from t.C, however,
   * the timer must be stopped and—if stop reports that the timer expired
   * before being stopped—the channel explicitly drained:
   *
   *     if (!t.stop()) {
   *       t.c.receive()
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
   * For a Timer created with AfterFunc(d, f), reset either reschedules
   * when f will run, in which case reset returns true, or schedules f
   * to run again, in which case it returns false.
   * When reset returns false, reset neither waits for the prior f to
   * complete before returning nor does it guarantee that the subsequent
   * goroutine running f does not run concurrently with the prior
   * one. If the caller needs to know whether the prior execution of
   * f is completed, it must coordinate with f explicitly.
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
