const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 40_000;
const WATCHDOG_INTERVAL_MS = 3_000;

export interface WebSocketHeartbeat {
  acknowledge(): void;
  stop(): void;
}

export function startWebSocketHeartbeat(
  socket: WebSocket,
  onTimeout: () => void,
): WebSocketHeartbeat {
  let lastAcknowledgedAt = Date.now();
  let stopped = false;
  let lastPingAt = 0;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(heartbeatTimer);
    window.clearInterval(watchdogTimer);
  };

  const heartbeatTimer = window.setInterval(() => {
    if (stopped || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify({ type: 'heartbeat' }));
      lastPingAt = Date.now();
    } catch {
      stop();
      onTimeout();
    }
  }, HEARTBEAT_INTERVAL_MS);

  const watchdogTimer = window.setInterval(() => {
    if (stopped || !lastPingAt || socket.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastAcknowledgedAt <= HEARTBEAT_TIMEOUT_MS) return;
    stop();
    onTimeout();
  }, WATCHDOG_INTERVAL_MS);

  return {
    acknowledge() {
      lastAcknowledgedAt = Date.now();
    },
    stop,
  };
}

export function getWebSocketReconnectDelay(attempt: number): number {
  const baseDelay = Math.min(1_000 * 2 ** Math.max(0, attempt), 30_000);
  return baseDelay + Math.floor(Math.random() * 500);
}
