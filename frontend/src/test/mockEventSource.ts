/** Controllable EventSource double for unit tests. */
export class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: MockEventSource[] = [];

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  closed = false;

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  static latest(): MockEventSource {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }

  static reset() {
    MockEventSource.instances = [];
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  emit(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  /** Transient drop: the browser keeps retrying (readyState CONNECTING). */
  drop() {
    this.readyState = 0;
    this.onerror?.(new Event("error"));
  }

  /** Fatal: the browser gives up (readyState CLOSED). */
  fail() {
    this.readyState = 2;
    this.onerror?.(new Event("error"));
  }

  close() {
    this.readyState = 2;
    this.closed = true;
  }

  addEventListener() {}
  removeEventListener() {}
}
