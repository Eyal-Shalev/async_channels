export class InvalidTransitionError extends TypeError {
  constructor(state: State, t: Transition) {
    super(
      `Invalid transition - ${
        JSON.stringify({ state: state.name, transition: t })
      }`,
    );
  }
}

enum Transition {
  REMOVE = "REMOVE",
  ADD = "ADD",
  ACK = "ACK",
}

/**
 * @throws {InvalidTransitionError}
 */
type State = (t: Transition) => State;

/**
 * @throws {InvalidTransitionError}
 */
export function HasBuffer(t: Transition): State {
  if (t === Transition.REMOVE) return RemoveStuck;
  if (t === Transition.ADD) return AddStuck;
  throw new InvalidTransitionError(HasBuffer, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function RemoveStuck(t: Transition): State {
  if (t === Transition.ADD) return WaitingForAck;
  throw new InvalidTransitionError(RemoveStuck, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function AddStuck(t: Transition): State {
  if (t === Transition.REMOVE) return RemoveStuck;
  throw new InvalidTransitionError(AddStuck, t);
}

/**
 * @throws {InvalidTransitionError}
 */
export function WaitingForAck(t: Transition): State {
  if (t === Transition.ACK) return HasBuffer;
  throw new InvalidTransitionError(WaitingForAck, t);
}

const scheduleTask = setTimeout;

export class Queue<T> {
  protected queue: T[] = [];

  constructor(readonly capacity: number) {
    if (capacity < 0 || !Number.isSafeInteger(capacity)) {
      throw new RangeError(
        "queue capacity must be a non-negative safe integer",
      );
    }
  }

  add(val: T) {
    if (this.isFull) throw new RangeError("queue is full");
    this.queue.push(val);
  }

  remove(): T {
    if (this.isEmpty) throw new RangeError("queue is empty");
    return this.queue.shift() as T;
  }

  peek(): T {
    if (this.isEmpty) throw new RangeError("queue is empty");
    return this.queue[0] as T;
  }

  get isFull(): boolean {
    return this.queue.length === this.capacity;
  }

  get isEmpty(): boolean {
    return this.queue.length === 0;
  }
}

export class AsyncQueue<T> {
  protected current: State = HasBuffer;
  protected transitionEventTarget = new EventTarget();
  protected stateEventTarget = new EventTarget();
  protected readonly queue: Queue<T>;

  constructor(
    capacity: number,
    protected readonly options?: { debug?: boolean },
  ) {
    this.queue = new Queue<T>(capacity);
    if (options?.debug) {
      const reporter = (prefix: string) => {
        return (ev: Event) => {
          this.debug(`${prefix}::${ev.type}`, {
            val: (ev as CustomEvent).detail,
          });
        };
      };
      Object.values(Transition).forEach((t) => {
        this.transitionEventTarget.addEventListener(t, reporter("Transition"));
      });

      [HasBuffer, RemoveStuck, AddStuck, WaitingForAck].forEach((state) => {
        this.stateEventTarget.addEventListener(state.name, reporter("State"));
      });
    }
  }

  async remove(): Promise<T> {
    if ([RemoveStuck, WaitingForAck].includes(this.current)) {
      await this.waitForState(HasBuffer);
    }

    if (this.current === HasBuffer && !this.queue.isEmpty) {
      return this.queue.remove();
    }

    // Register to the PopStuck event before transitioning to guarantee order.
    const waitForAckPromise = this.waitForState(WaitingForAck);

    this.updateState(Transition.REMOVE);
    const val = await waitForAckPromise as T;
    this.updateState(Transition.ACK);

    if (this.queue.isEmpty) return val;

    const valToReturn = this.queue.remove();
    this.queue.add(val);
    return valToReturn;
  }

  async add(val: T): Promise<void> {
    if ([AddStuck, WaitingForAck].includes(this.current)) {
      await this.waitForState(HasBuffer);
    }

    if (!this.queue.isFull) {
      this.queue.add(val);
      return;
    }

    // Register to the RemoveStuck event before transitioning to guarantee order.
    const afterAddPromise = this.current === RemoveStuck
      ? Promise.resolve()
      : this.waitForState(RemoveStuck);

    this.updateState(Transition.ADD, val);
    if (this.current === HasBuffer) return;

    await afterAddPromise;

    if (this.current === RemoveStuck) {
      return this.updateState(Transition.ADD, val);
    }
  }

  peek(): T {
    return this.queue.peek();
  }

  get isFull(): boolean {
    return this.queue.isFull;
  }

  get isEmpty(): boolean {
    return this.queue.isEmpty;
  }

  /**
   * @throws {InvalidTransitionError}
   */
  updateState(t: Transition, val?: T): void {
    this.current = this.current(t);
    this.transitionEventTarget.dispatchEvent(
      new CustomEvent(t, { detail: val }),
    );
    this.stateEventTarget.dispatchEvent(
      new CustomEvent(this.current.name, { detail: val }),
    );
  }

  waitForState(state: State): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      this.stateEventTarget.addEventListener(state.name, (ev) => {
        scheduleTask(() => {
          resolve((ev as CustomEvent).detail as T);
        });
      }, { once: true });
    });
  }

  waitForTransition(t: Transition): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      this.transitionEventTarget.addEventListener(t, (ev) => {
        scheduleTask(() => resolve((ev as CustomEvent).detail as T));
      }, { once: true });
    });
  }

  protected debug(...args: unknown[]) {
    if (this.options?.debug) {
      console.debug(...args, { currentState: this.current.name });
    }
  }
}
