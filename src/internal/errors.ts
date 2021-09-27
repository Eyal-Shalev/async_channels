/**
 * The `Error` class used when `get` or `send` are aborted before
 * completion.
 */
export class AbortedError extends Error {
  constructor(type: "send" | "get") {
    super(`${type} aborted`);
  }
}
