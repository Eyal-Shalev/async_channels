/**
 * The `Error` class used when `receive` or `send` are aborted before
 * completion.
 */
export class AbortedError extends Error {
  constructor(type: "send" | "receive" | "get") {
    super(`${type} aborted`);
  }
}
