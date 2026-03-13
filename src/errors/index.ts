export class DevHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevHubError";
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, new.target);
    }
  }
}

// ─── Agent registry errors ────────────────────────────────────────────────────
