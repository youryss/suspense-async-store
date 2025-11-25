// src/asyncStore.ts

/**
 * A key used to identify cached entries.
 * Can be a string or an array of values (which will be JSON stringified).
 *
 * @example
 * ```ts
 * // String key
 * store.get("user-123", fetcher);
 *
 * // Array key (recommended for structured keys)
 * store.get(["users", userId], fetcher);
 * ```
 */
export type Key = string | readonly unknown[];

/**
 * Context passed into fetchers, providing AbortSignal for request cancellation.
 *
 * @example
 * ```ts
 * const fetcher = async ({ signal }) => {
 *   const res = await fetch(url, { signal });
 *   return res.json();
 * };
 * ```
 */
export interface FetchContext {
  /** AbortSignal that can be used to cancel the request */
  signal: AbortSignal;
}

/**
 * A fetcher function that accepts a FetchContext and returns a Promise.
 * The fetcher should use the provided signal for request cancellation.
 *
 * @template T - The type of data returned by the fetcher
 * @param ctx - FetchContext containing AbortSignal
 * @returns Promise resolving to the fetched data
 *
 * @example
 * ```ts
 * // With native fetch
 * const fetcher: Fetcher<User> = async ({ signal }) => {
 *   const res = await fetch("/api/user", { signal });
 *   if (!res.ok) throw new Error("Failed to fetch");
 *   return res.json();
 * };
 *
 * // With axios
 * const fetcher: Fetcher<User> = async ({ signal }) => {
 *   const res = await axios.get("/api/user", { signal });
 *   return res.data;
 * };
 * ```
 */
export type Fetcher<T> = (ctx: FetchContext) => Promise<T>;

interface Entry<T> {
  promise: Promise<T>;
  controller: AbortController;
}

/**
 * Suspense-style Resource for React 18.
 * The `read()` method throws a Promise while pending, throws an Error on failure,
 * or returns the value on success.
 *
 * @template T - The type of data in the resource
 *
 * @example
 * ```tsx
 * // React 18 usage
 * function UserDetails({ id }: { id: string }) {
 *   const resource = store.getResource<User>(["user", id], fetcher);
 *   const user = resource.read(); // throws Promise or Error, or returns User
 *   return <div>{user.name}</div>;
 * }
 * ```
 */
export interface Resource<T> {
  /**
   * Reads the resource value.
   * - Throws a Promise while the request is pending (triggers Suspense)
   * - Throws an Error if the request failed (triggers ErrorBoundary)
   * - Returns the value if the request succeeded
   *
   * @returns The resolved value of type T
   * @throws Promise while pending
   * @throws Error if the request failed
   */
  read(): T;
}

/**
 * Creates a new async store instance for managing cached async data.
 *
 * The store provides:
 * - Automatic Promise caching by key
 * - AbortController support for request cancellation
 * - React 19+ support via `get()` returning Promises (use with `use()`)
 * - React 18 support via `getResource()` returning Resources (use with Suspense)
 *
 * @returns An async store instance with `get`, `getResource`, `invalidate`, and `clear` methods
 *
 * @example
 * ```ts
 * // Create a store instance
 * const api = createAsyncStore();
 *
 * // React 19+ usage
 * const user = use(api.get(["user", id], fetcher));
 *
 * // React 18 usage
 * const resource = api.getResource(["user", id], fetcher);
 * const user = resource.read();
 * ```
 */
export function createAsyncStore() {
  const cache = new Map<string, Entry<unknown>>();

  /**
   * Normalize a Key into a string for Map indexing.
   */
  function keyToString(key: Key): string {
    return typeof key === "string" ? key : JSON.stringify(key);
  }

  /**
   * Gets a cached Promise for the given key, or creates it with the fetcher.
   * Subsequent calls with the same key will return the cached Promise.
   *
   * Designed for React 19+ with the `use()` hook.
   *
   * @template T - The type of data returned by the fetcher
   * @param key - Cache key (string or array)
   * @param fetcher - Function that fetches the data
   * @returns Promise that resolves to the fetched data
   *
   * @example
   * ```tsx
   * // React 19+
   * function UserDetails({ id }: { id: string }) {
   *   const user = use(
   *     api.get(["user", id], async ({ signal }) => {
   *       const res = await fetch(`/api/users/${id}`, { signal });
   *       return res.json();
   *     })
   *   );
   *   return <div>{user.name}</div>;
   * }
   * ```
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
   * Gets a Suspense-compatible Resource for the given key.
   * The Resource's `read()` method throws a Promise while pending (for Suspense)
   * or throws an Error on failure (for ErrorBoundary).
   *
   * Designed for React 18 where `use()` is not available.
   *
   * @template T - The type of data returned by the fetcher
   * @param key - Cache key (string or array)
   * @param fetcher - Function that fetches the data
   * @returns Resource with a `read()` method
   *
   * @example
   * ```tsx
   * // React 18
   * function UserDetails({ id }: { id: string }) {
   *   const resource = api.getResource(["user", id], async ({ signal }) => {
   *     const res = await fetch(`/api/users/${id}`, { signal });
   *     return res.json();
   *   });
   *   const user = resource.read(); // throws Promise or Error, or returns User
   *   return <div>{user.name}</div>;
   * }
   * ```
   */
  function getResource<T>(key: Key, fetcher: Fetcher<T>): Resource<T> {
    const promise = get<T>(key, fetcher);
    return createResourceFromPromise(promise);
  }

  /**
   * Invalidates a cached entry by key.
   * - Aborts any in-flight request for this key
   * - Removes the entry from the cache
   *
   * Useful for manual cache invalidation, retry logic, or when data becomes stale.
   *
   * @param key - Cache key to invalidate
   *
   * @example
   * ```ts
   * // Invalidate after mutation
   * await updateUser(userId, data);
   * api.invalidate(["user", userId]);
   *
   * // Retry on error
   * try {
   *   const user = use(api.get(["user", id], fetcher));
   * } catch (error) {
   *   api.invalidate(["user", id]);
   *   // Retry...
   * }
   * ```
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
   * Clears the entire cache.
   * - Aborts all in-flight requests
   * - Removes all entries from the cache
   *
   * Useful for logout, reset, or when you want to start fresh.
   *
   * @example
   * ```ts
   * // Clear cache on logout
   * function handleLogout() {
   *   api.clear();
   *   // ... logout logic
   * }
   * ```
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
  let error: unknown;

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
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "ERR_CANCELED"
  )
    return true;
  return false;
}
