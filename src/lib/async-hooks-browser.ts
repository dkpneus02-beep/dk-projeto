type Store = unknown;

/**
 * Browser fallback used only by the Vite client bundle.
 * TanStack Start imports its storage-context module in shared code, while
 * Node's AsyncLocalStorage is not available in browsers.
 */
export class AsyncLocalStorage<T = Store> {
  private currentStore: T | undefined;

  disable(): void {
    this.currentStore = undefined;
  }

  getStore(): T | undefined {
    return this.currentStore;
  }

  enterWith(store: T): void {
    this.currentStore = store;
  }

  run<R>(store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R {
    const previousStore = this.currentStore;
    this.currentStore = store;
    try {
      return callback(...args);
    } finally {
      this.currentStore = previousStore;
    }
  }
}
