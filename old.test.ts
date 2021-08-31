import {AsyncZeroStack, ticker} from "./old.ts";

const sleep = (timeout: number) => {
  return new Promise<void>(res => {
    setTimeout(() => res(), timeout)
  })
}

Deno.test("old.test.ts", async () => {
  console.log()
  const abortCtrl = new AbortController()
  // ticker(abortCtrl.signal)
  const stack = new AsyncZeroStack<number>()

  console.log(await Promise.allSettled([
    stack.pop(),
    stack.pop(),
    stack.push(1),
    stack.push(2),
    stack.push(3),
    stack.pop(),
    // sleep(1000),
  ]))

  abortCtrl.abort()
})
