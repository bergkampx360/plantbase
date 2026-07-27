import '@testing-library/jest-dom/vitest';

// jsdom nem implementálja a ResizeObserver-t — a use-stick-to-bottom (ai-elements
// Conversation, H1) belül erre épít, enélkül a jsdom-os tesztek ReferenceError-ral
// elszállnának
/* eslint-disable @typescript-eslint/no-empty-function -- szándékos no-op stub */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
/* eslint-enable @typescript-eslint/no-empty-function */

globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver;
