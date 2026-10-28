export class LocalTransport {
  constructor() {
    this.listeners = new Set();
  }

  send(resolved) {
    // Local mode is synchronous; the session already notifies subscribers.
    // PeerTransport will override this to broadcast over the network.
    return resolved;
  }

  onReceive(handler) {
    this.receiveHandler = handler;
  }
}