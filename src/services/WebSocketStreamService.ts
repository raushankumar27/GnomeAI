export type StreamListener = (event: any) => void;

export class WebSocketStreamService {
  private ws: WebSocket | null = null;
  private listeners: Set<StreamListener> = new Set();
  private url: string;

  constructor(url: string = "ws://localhost:8000/ws/chat") {
    this.url = url;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data);
        this.notify(data);
      } catch (err) {
        this.notify({ type: "raw_text", data: message.data });
      }
    };
    this.ws.onerror = (err) => {
      this.notify({ type: "error", error: "WebSocket stream connection error" });
    };
  }

  send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === "string" ? data : JSON.stringify(data));
    } else {
      console.warn("WebSocket not connected. Unable to send message.");
    }
  }

  subscribe(listener: StreamListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: any): void {
    this.listeners.forEach((listener) => listener(event));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const wsStreamService = new WebSocketStreamService();
