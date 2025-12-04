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
 * Cache management strategy configuration.
 */
export type CacheStrategy =
  | {
      type: "reference-counting";
      /** Time in milliseconds to wait before cleaning up unreferenced entries (default: 5000) */
      cleanupInterval?: number;
      /** Grace period in milliseconds before removing an unreferenced entry (default: 1000) */
      gracePeriod?: number;
    }
  | {
      type: "lru";
      /** Maximum number of entries to keep in cache */
      maxSize: number;
    }
  | {
      type: "ttl";
      /** Time in milliseconds before entries expire */
      ttl: number;
      /** Interval in milliseconds for cleanup checks (default: ttl / 2) */
      cleanupInterval?: number;
    }
  | {
      type: "manual";
    };

/**
 * Configuration options for creating an async store.
 */
export interface AsyncStoreConfig {
  /**
   * Cache management strategy.
   *
   * - `reference-counting` (default): Automatic cleanup when components using the data are unmounted
   * - `lru`: Keep only N most recently used entries
   * - `ttl`: Time-based expiration
   * - `manual`: No automatic cleanup (current behavior)
   *
   * @default { type: "reference-counting", cleanupInterval: 5000, gracePeriod: 1000 }
   */
  strategy?: CacheStrategy;
}

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
  /** References to components using this entry (for reference-counting strategy) */
  references: Set<WeakRef<object>>;
  /** Timestamp when entry was created (for TTL strategy) */
  createdAt: number;
  /** Timestamp when entry was last accessed (for reference-counting strategies) */
  lastAccessed: number;
  /** Access counter for LRU ordering (monotonically increasing) */
  accessOrder: number;
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
 * - Configurable cache management strategies (reference-counting, LRU, TTL, manual)
 * - AbortController support for request cancellation
 * - React 19+ support via `get()` returning Promises (use with `use()`)
 * - React 18 support via `getResource()` returning Resources (use with Suspense)
 *
 * @param config - Optional configuration for cache strategy
 * @returns An async store instance with `get`, `getResource`, `invalidate`, and `clear` methods
 *
 * @example
 * ```ts
 * // Default: reference-counting strategy (automatic cleanup)
 * const api = createAsyncStore();
 *
 * // LRU strategy: keep only 100 most recent entries
 * const api = createAsyncStore({
 *   strategy: { type: "lru", maxSize: 100 }
 * });
 *
 * // TTL strategy: expire after 5 minutes
 * const api = createAsyncStore({
 *   strategy: { type: "ttl", ttl: 5 * 60 * 1000 }
 * });
 *
 * // Manual strategy: no automatic cleanup
 * const api = createAsyncStore({
 *   strategy: { type: "manual" }
 * });
 *
 * // React 19+ usage
 * const user = use(api.get(["user", id], fetcher));
 *
 * // React 18 usage
 * const resource = api.getResource(["user", id], fetcher);
 * const user = resource.read();
 * ```
 */
export function createAsyncStore(config?: AsyncStoreConfig) {
  const strategy: CacheStrategy = config?.strategy ?? {
    type: "reference-counting",
    cleanupInterval: 5000,
    gracePeriod: 1000,
  };

  const cache = new Map<string, Entry<unknown>>();
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;
  let registry: FinalizationRegistry<string> | null = null;
  let accessCounter = 0; // Monotonically increasing counter for LRU ordering

  // Initialize FinalizationRegistry for reference-counting strategy
  if (strategy.type === "reference-counting") {
    registry = new FinalizationRegistry((_key: string) => {
      // When a component is garbage collected, we don't immediately remove the cache entry
      // The cleanup interval will handle it after the grace period
    });
  }

  // Start cleanup interval for reference-counting and TTL strategies
  if (strategy.type === "reference-counting") {
    const interval = strategy.cleanupInterval ?? 5000;
    const gracePeriod = strategy.gracePeriod ?? 1000;

    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of cache.entries()) {
        // Remove references to GC'd objects
        const liveRefs = new Set<WeakRef<object>>();
        for (const ref of entry.references) {
          if (ref.deref() !== undefined) {
            liveRefs.add(ref);
          }
        }
        entry.references = liveRefs;

        // If no live references and grace period has passed, clean up
        if (
          entry.references.size === 0 &&
          now - entry.lastAccessed > gracePeriod
        ) {
          entry.controller.abort();
          cache.delete(key);
        }
      }
    }, interval);
  } else if (strategy.type === "ttl") {
    const ttl = strategy.ttl;
    const interval = strategy.cleanupInterval ?? Math.max(ttl / 2, 1000);

    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of cache.entries()) {
        if (now - entry.createdAt > ttl) {
          entry.controller.abort();
          cache.delete(key);
        }
      }
    }, interval);
  }

  /**
   * Normalize a Key into a string for Map indexing.
   */
  function keyToString(key: Key): string {
    return typeof key === "string" ? key : JSON.stringify(key);
  }

  /**
   * Helper to evict entries if needed based on LRU strategy
   */
  function evictIfNeeded(): void {
    if (strategy.type === "lru" && cache.size >= strategy.maxSize) {
      // Find the least recently used entry (smallest accessOrder)
      let oldestKey: string | null = null;
      let oldestOrder = Infinity;

      for (const [key, entry] of cache.entries()) {
        if (entry.accessOrder < oldestOrder) {
          oldestOrder = entry.accessOrder;
          oldestKey = key;
        }
      }

      if (oldestKey !== null) {
        const entry = cache.get(oldestKey);
        if (entry) {
          entry.controller.abort();
          cache.delete(oldestKey);
        }
      }
    }
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
    const now = Date.now();
    let entry = cache.get(k) as Entry<T> | undefined;

    // Check TTL expiration for existing entry
    if (
      entry &&
      strategy.type === "ttl" &&
      now - entry.createdAt > strategy.ttl
    ) {
      entry.controller.abort();
      cache.delete(k);
      entry = undefined;
    }

    if (!entry) {
      evictIfNeeded();

      const controller = new AbortController();

      const promise = fetcher({ signal: controller.signal }).catch((err) => {
        // If the error is an abort, drop the cache entry so the next call refetches.
        if (isAbortError(err)) {
          cache.delete(k);
        }
        throw err;
      });

      entry = {
        promise,
        controller,
        references: new Set(),
        createdAt: now,
        lastAccessed: now,
        accessOrder: ++accessCounter,
      };
      cache.set(k, entry);
    } else {
      // Update last accessed time and access order
      entry.lastAccessed = now;
      entry.accessOrder = ++accessCounter;
    }

    return entry.promise;
  }

  /**
   * Adds a reference to a cache entry for automatic lifecycle tracking.
   * Used internally by React hooks for reference-counting strategy.
   *
   * @internal
   */
  function addReference(key: Key, ref: object): void {
    const k = keyToString(key);
    const entry = cache.get(k);
    if (entry && registry) {
      const weakRef = new WeakRef(ref);
      entry.references.add(weakRef);
      registry.register(ref, k, weakRef);
    }
  }

  /**
   * Removes a reference from a cache entry.
   * Used internally by React hooks for reference-counting strategy.
   *
   * @internal
   */
  function removeReference(key: Key, ref: object): void {
    const k = keyToString(key);
    const entry = cache.get(k);
    if (entry && registry) {
      // Find and remove the WeakRef for this object
      for (const weakRef of entry.references) {
        if (weakRef.deref() === ref) {
          entry.references.delete(weakRef);
          registry.unregister(weakRef);
          break;
        }
      }
    }
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

  /**
   * Disposes of the store and cleans up all resources.
   * - Stops cleanup timers
   * - Aborts all in-flight requests
   * - Clears the cache
   *
   * Call this when you no longer need the store to prevent memory leaks
   * from the cleanup intervals.
   *
   * @example
   * ```ts
   * const api = createAsyncStore();
   * // ... use the store
   * api.dispose(); // Clean up when done
   * ```
   */
  function dispose(): void {
    if (cleanupTimer !== null) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    clear();
  }

  return {
    get,
    getResource,
    invalidate,
    clear,
    dispose,
    addReference,
    removeReference,
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
