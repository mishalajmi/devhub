export interface SessionState {
  /** Unsubscribe function returned by onSidecarEvent — call to clean up the listener. */
  unlisten: () => void;
}

export interface RemoteSessionState extends SessionState {
  baseUrl: string;
}
