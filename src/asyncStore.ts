// src/asyncStore.ts

/** A key used to identify cached entries. */
export type Key = string | readonly unknown[];

/** Context passed into fetchers, currently just AbortSignal. */
export interface FetchContext {
  signal: AbortSignal;
}

/**
 * A fetcher is any function that:
 * - Accepts a FetchContext (for AbortSignal)
 * - Returns a Promise of data
 *
 * It can wrap fetch, axios, or any custom client.
 */
export type Fetcher<T> = (ctx: FetchContext) => Promise<T>;

interface Entry<T> {
  promise: Promise<T>;
  controller: AbortController;
}

/** Suspense-style Resource for React 18 (read throws while pending/error). */
export interface Resource<T> {
  read(): T; // may throw Promise or Error
}

/**
 * Create a framework-agnostic async store:
 * - Caches Promises by key
 * - Supports AbortController
 * - Exposes Promise and Resource APIs
 */
export function createAsyncStore() {
  const cache = new Map<string, Entry<any>>();

  /**
   * Normalize a Key into a string for Map indexing.
   */
  function keyToString(key: Key): string {
    return typeof key === "string" ? key : JSON.stringify(key);
  }

  /**
   * Get a cached Promise for the given key, or create it with the fetcher.
   */
  function get<T>(key: Key, fetcher: Fetcher<T>): Promise<T> {
    const k = keyToString(key);
    let entry = cache.get(k) as Entry<T> | undefined;

    if (!entry) {
      const controller = new AbortController();

      const promise = fetcher({ signal: controller.signal }).catch((err) => {
        // If the error is an abort, drop the cache entry so the next call refetches.
        if (isAbortError(err)) {
          cache.delete(k);
        }
        throw err;
      });

      entry = { promise, controller };
      cache.set(k, entry);
    }

    return entry.promise;
  }

  /**
   * React 18 helper: wrap the cached Promise in a Suspense-style Resource.
   */
  function getResource<T>(key: Key, fetcher: Fetcher<T>): Resource<T> {
    const promise = get<T>(key, fetcher);
    return createResourceFromPromise(promise);
  }

  /**
   * Invalidate a single entry:
   * - Abort in-flight request
   * - Remove from cache
   */
  function invalidate(key: Key): void {
    const k = keyToString(key);
    const entry = cache.get(k);
    if (entry) {
      entry.controller.abort();
      cache.delete(k);
    }
  }

  /**
   * Clear the entire cache:
   * - Abort all in-flight requests
   * - Remove everything from cache
   */
  function clear(): void {
    for (const [, entry] of cache) {
      entry.controller.abort();
    }
    cache.clear();
  }

  return {
    get,
    getResource,
    invalidate,
    clear,
  };
}

/**
 * Implementation of a Suspense Resource for React 18:
 * - While pending, read() throws the underlying Promise.
 * - If error, read() throws the error.
 * - If success, read() returns the value.
 */
function createResourceFromPromise<T>(promise: Promise<T>): Resource<T> {
  let status: "pending" | "success" | "error" = "pending";
  let value: T;
  let error: any;

  const suspender = promise.then(
    (v) => {
      status = "success";
      value = v;
    },
    (e) => {
      status = "error";
      error = e;
    }
  );

  return {
    read() {
      if (status === "pending") throw suspender;
      if (status === "error") throw error;
      return value!;
    },
  };
}

/**
 * Detect whether an error represents an aborted request.
 * Supports:
 * - DOMException 'AbortError' (native fetch)
 * - code 'ERR_CANCELED' (axios-style)
 */
function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if ((err as any)?.code === "ERR_CANCELED") return true;
  return false;
}
