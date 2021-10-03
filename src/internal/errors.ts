/**
 * The `Error` class used when `get` or `send` are aborted before
 * completion.
 */
export class AbortedError extends Error {
  constructor(type: "send" | "get") {
    super(`${type} aborted`);
  }
}

export class UnreachableError extends Error {
  constructor() {
    super("You've reached an unreachable state, congratulations ¯\_(ツ)_/¯");
  }
}
