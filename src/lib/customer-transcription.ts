import {
  callTranscriptionSocketUrl,
  createCallTranscriptionSocketTicket,
} from '@/lib/auth-client';

export type CustomerSentiment = 'positive' | 'neutral' | 'negative';
export type CustomerTranscriptionTransportKind = 'websocket';

export interface CustomerTranscriptionResult {
  text: string;
  final: boolean;
  sentiment?: CustomerSentiment;
}

export interface CustomerTranscriptionTransport {
  connect(): Promise<void>;
  sendAudio(chunk: Blob): void;
  close(): Promise<void>;
}

type ResultHandler = (result: CustomerTranscriptionResult) => void;
type ErrorHandler = (error: Error) => void;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readSentiment(value: unknown): CustomerSentiment | undefined {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'positive' || normalized === 'neutral' || normalized === 'negative') {
      return normalized;
    }
    return undefined;
  }

  const object = asObject(value);
  const label = object?.sentiment ?? object?.label;
  return typeof label === 'string' ? readSentiment(label) : undefined;
}

/** Normalize Nova-3's realtime event and its documented JSON result shape. */
function parseResult(payload: unknown): CustomerTranscriptionResult | null {
  const root = asObject(payload);
  if (!root) return null;

  const channel = asObject(root.channel);
  const alternatives = Array.isArray(channel?.alternatives) ? channel.alternatives : [];
  const firstAlternative = asObject(alternatives[0]);
  const results = asObject(root.results);
  const channels = Array.isArray(results?.channels) ? results.channels : [];
  const firstChannel = asObject(channels[0]);
  const resultAlternatives = Array.isArray(firstChannel?.alternatives)
    ? firstChannel.alternatives
    : [];
  const resultAlternative = asObject(resultAlternatives[0]);
  const text = String(
    firstAlternative?.transcript ?? resultAlternative?.transcript ?? root.transcript ?? ''
  ).trim();
  if (!text) return null;

  const resultSentiments = asObject(results?.sentiments);
  const sentimentSegments = Array.isArray(resultSentiments?.segments)
    ? resultSentiments.segments
    : [];
  const sentiment =
    readSentiment(firstAlternative?.sentiment) ??
    readSentiment(root.sentiment) ??
    readSentiment(asObject(root.sentiments)?.average) ??
    readSentiment(asObject(sentimentSegments[sentimentSegments.length - 1])) ??
    readSentiment(resultSentiments?.average);
  return {
    text,
    final: root.is_final === true || root.speech_final === true || root.type === 'Results',
    sentiment,
  };
}

export function createCustomerTranscriptionTransport(
  kind: CustomerTranscriptionTransportKind,
  onResult: ResultHandler,
  onError: ErrorHandler
): CustomerTranscriptionTransport {
  switch (kind) {
    case 'websocket':
      return new Nova3WebSocketTransport(onResult, onError);
  }
}

class Nova3WebSocketTransport implements CustomerTranscriptionTransport {
  private socket: WebSocket | null = null;
  private closedByClient = false;
  private closePromise: Promise<void> | null = null;

  constructor(
    private readonly onResult: ResultHandler,
    private readonly onError: ErrorHandler
  ) {}

  async connect(): Promise<void> {
    const ticket = await createCallTranscriptionSocketTicket();
    const socket = new WebSocket(callTranscriptionSocketUrl(ticket));
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error('Cloud transcription connection timed out.'));
      }, 12_000);

      socket.onopen = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      socket.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Could not connect to cloud transcription.'));
      };
      socket.onclose = (event) => {
        window.clearTimeout(timeout);
        if (!this.closedByClient) {
          const message = event.reason || 'Cloud transcription connection closed.';
          this.onError(new Error(message));
        }
      };
      socket.onmessage = (event) => {
        void this.handleMessage(event.data);
      };
    });
  }

  sendAudio(chunk: Blob): void {
    if (this.socket?.readyState === WebSocket.OPEN && chunk.size > 0) {
      this.socket.send(chunk);
    }
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closedByClient = true;
    const socket = this.socket;
    if (!socket) return Promise.resolve();

    this.closePromise = new Promise((resolve) => {
      let finished = false;
      let closeTimer = 0;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(closeTimer);
        this.socket = null;
        resolve();
      };
      socket.addEventListener('close', finish, { once: true });

      // Let MediaRecorder flush its final compressed frame before finalizing.
      window.setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: 'CloseStream' }));
          } catch {
            /* The socket may already be closing. */
          }
          window.setTimeout(() => socket.close(1000, 'Capture stopped'), 700);
        } else {
          socket.close(1000, 'Capture stopped');
        }
      }, 200);

      closeTimer = window.setTimeout(() => {
        socket.close(1000, 'Capture stopped');
        finish();
      }, 1_500);
    });
    return this.closePromise;
  }

  private async handleMessage(data: unknown): Promise<void> {
    let text: string;
    if (typeof data === 'string') {
      text = data;
    } else if (data instanceof Blob) {
      text = await data.text();
    } else if (data instanceof ArrayBuffer) {
      text = new TextDecoder().decode(data);
    } else {
      return;
    }

    try {
      const result = parseResult(JSON.parse(text));
      if (result) this.onResult(result);
    } catch {
      // Non-JSON control frames are not transcript results.
    }
  }
}
