// src/hooks.ts
// React hooks for automatic lifecycle management with suspense-async-store
// Import from "suspense-async-store/hooks" to use these utilities

import { useEffect, useRef } from "react";
import type { Key, Fetcher, Resource } from "./asyncStore";

/**
 * Type representing the async store instance.
 * This should match the return type of createAsyncStore.
 */
export interface AsyncStore {
  get<T>(key: Key, fetcher: Fetcher<T>): Promise<T>;
  getResource<T>(key: Key, fetcher: Fetcher<T>): Resource<T>;
  invalidate(key: Key): void;
  clear(): void;
  dispose(): void;
  addReference(key: Key, ref: object): void;
  removeReference(key: Key, ref: object): void;
}

/**
 * React hook that automatically manages lifecycle for a cache entry.
 * Registers a reference when the component mounts and removes it when unmounted.
 *
 * This hook is primarily useful with the reference-counting cache strategy
 * to enable automatic cleanup when components are unmounted.
 *
 * For React 19+, use this with the `use()` hook.
 * For React 18, use `useAsyncResource()` instead.
 *
 * @template T - The type of data returned by the fetcher
 * @param store - The async store instance
 * @param key - Cache key (string or array)
 * @param fetcher - Function that fetches the data
 * @returns Promise that resolves to the fetched data (use with React's `use()` hook)
 *
 * @example
 * ```tsx
 * // React 19+
 * import { use } from "react";
 * import { useAsyncValue } from "suspense-async-store/hooks";
 *
 * function UserDetails({ id }: { id: string }) {
 *   const userPromise = useAsyncValue(
 *     api,
 *     ["user", id],
 *     async ({ signal }) => {
 *       const res = await fetch(`/api/users/${id}`, { signal });
 *       return res.json();
 *     }
 *   );
 *   const user = use(userPromise);
 *   return <div>{user.name}</div>;
 * }
 * ```
 */
export function useAsyncValue<T>(
  store: AsyncStore,
  key: Key,
  fetcher: Fetcher<T>
): Promise<T> {
  // Use a stable reference object for tracking
  const refObject = useRef<object>({});

  useEffect(() => {
    // Register this component as a reference holder
    store.addReference(key, refObject.current);

    // Cleanup: remove reference when component unmounts
    return () => {
      store.removeReference(key, refObject.current);
    };
  }, [store, key]);

  return store.get(key, fetcher);
}

/**
 * React hook that automatically manages lifecycle for a cache entry (React 18 version).
 * Returns a Resource that can be read using the `.read()` method.
 *
 * This hook is for React 18 where the `use()` hook is not available.
 * For React 19+, use `useAsyncValue()` instead.
 *
 * @template T - The type of data returned by the fetcher
 * @param store - The async store instance
 * @param key - Cache key (string or array)
 * @param fetcher - Function that fetches the data
 * @returns Resource with a `read()` method
 *
 * @example
 * ```tsx
 * // React 18
 * import { useAsyncResource } from "suspense-async-store/hooks";
 *
 * function UserDetails({ id }: { id: string }) {
 *   const resource = useAsyncResource(
 *     api,
 *     ["user", id],
 *     async ({ signal }) => {
 *       const res = await fetch(`/api/users/${id}`, { signal });
 *       return res.json();
 *     }
 *   );
 *   const user = resource.read();
 *   return <div>{user.name}</div>;
 * }
 * ```
 */
export function useAsyncResource<T>(
  store: AsyncStore,
  key: Key,
  fetcher: Fetcher<T>
): Resource<T> {
  // Use a stable reference object for tracking
  const refObject = useRef<object>({});

  useEffect(() => {
    // Register this component as a reference holder
    store.addReference(key, refObject.current);

    // Cleanup: remove reference when component unmounts
    return () => {
      store.removeReference(key, refObject.current);
    };
  }, [store, key]);

  return store.getResource(key, fetcher);
}
