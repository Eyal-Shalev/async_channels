import {EmptyState, isEmpty, isPopStuck, isPushStuck, StateNames, Transition} from "./state-machine-old.ts";

export const ticker = (signal?: AbortSignal) => {
  function foo(i = 0) {
    if (signal?.aborted) return
    console.log(`t#${i}`)
    setTimeout(foo, 0, i + 1)
  }

  foo()
}

const scheduleMicroTask = <T>(fn: () => T): Promise<T> => {
  return new Promise((res,rej) => {
    setTimeout(() => {
      try {
        res(fn())
      } catch (e) {
        rej(e)
      }
    })
  })
}

const scheduleTask = setTimeout

const nextTick = () => {
  console.debug("nextTickStart")
  return scheduleMicroTask(() => {})
    .finally(() => console.debug("nextTickEnd"))
}

class PopEvent<T> extends CustomEvent {
  constructor() {
    super(PopEvent.name);
  }
}

class AckEvent<T> extends CustomEvent {
  constructor() {
    super(AckEvent.name);
  }
}

class PushEvent<T> extends CustomEvent {
  constructor(public readonly val: T) {
    super(PushEvent.name);
  }
}

export class AsyncZeroStack<T> {
  #eventTarget = new EventTarget()
  #state = EmptyState

  constructor() {
    Object.values(Transition).forEach(transition => {
      this.#eventTarget.addEventListener(transition, event => this.debug(`transition: ${event.type}`, {val: (event as CustomEvent<T>).detail}))
    })
    Object.values(StateNames).forEach(stateName => {
      this.#eventTarget.addEventListener(stateName, event => this.debug(`state: ${event.type}`, {val: (event as CustomEvent<T>).detail}))
    })
  }

  protected get state() {
    return this.#state
  }

  public async pop(): Promise<T> {
    this.debug("pop start")

    if (isPopStuck(this.state)) {
      await this.waitFor(StateNames.EMPTY)
      return this.pop()
    }

    if (isPushStuck(this.state)) {
      this.updateState(Transition.POP)
    } else {
      this.updateState(Transition.POP_STUCK)
    }

    const val = await this.waitForVal()
    this.updateState(Transition.ACK)
    return val
  }

  public async push(val: T): Promise<void> {
    this.debug("push start", {val})

    if (isPushStuck(this.state)) {
      await this.waitFor(StateNames.EMPTY)
      return this.push(val)
    }

    if (isEmpty(this.state)) {
      this.updateState(Transition.PUSH_STUCK)
      await this.waitFor(Transition.POP)
    }

    this.updateState(Transition.WAIT, val)
    await this.waitFor(Transition.ACK)
    this.updateState(Transition.PUSH_DONE, val)
  }

  private waitFor(type: StateNames|Transition): Promise<void> {
    this.debug(`${this.waitFor.name}(${type})`)
    return new Promise<void>(res => {
      this.#eventTarget.addEventListener(type, ev => {
        scheduleTask(res)
      }, {once: true})
    })
  }

  private waitForVal(): Promise<T> {
    this.debug(this.waitForVal.name)
    return new Promise<T>(res => {
      this.#eventTarget.addEventListener(Transition.WAIT, ev => {
        scheduleTask(() => res((ev as CustomEvent<T>).detail))
      }, {once: true})
    })
  }

  private updateState(t: Transition, val?: T) {
    const oldState = this.state
    this.#state = this.state(t)
    this.debug("updateState", {transition: t, oldState, val})
    this.#eventTarget.dispatchEvent(new CustomEvent(t, {detail: val}))
    this.#eventTarget.dispatchEvent(new CustomEvent(this.state.stateName, {detail: val}))
  }

  private debug(msg: string, extra: Record<string, any> = {}) {
    console.debug(msg, {...extra, state: this.state})
  }
}