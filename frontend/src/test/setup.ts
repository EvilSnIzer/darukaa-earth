import '@testing-library/jest-dom/vitest';

// jsdom has no layout engine; Chart.js reads these during registration.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  value: () => null,
});

// localStorage is used by the token store.
if (!('localStorage' in globalThis)) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
    configurable: true,
  });
}
