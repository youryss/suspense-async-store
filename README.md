# suspense-async-store

A tiny async store for React Suspense with automatic memory management:

- **Framework-agnostic core** - Works with any fetch client (fetch, axios, etc.)
- **Automatic memory management** - Prevents memory leaks with configurable cache strategies
- **Supports AbortController / AbortSignal**
- Supports:
  - **React 19+:** `use(store.get(key, fetcher))`
  - **React 18:** `store.getResource(key, fetcher).read()`
- Optional fetch helpers and React hooks available as separate imports

## Installation

```bash
npm install suspense-async-store
```

## Quick Start

```tsx
import { createAsyncStore } from "suspense-async-store";
import { createJsonFetcher } from "suspense-async-store/fetch-helpers";
import { use, Suspense } from "react";

// Creates a store with automatic memory management (reference-counting by default)
const api = createAsyncStore();

function UserDetails({ id }: { id: string }) {
  const user = use(
    api.get(["user", id], createJsonFetcher(`/api/users/${id}`))
  );
  return <div>{user.name}</div>;
}

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserDetails id="123" />
    </Suspense>
  );
}
```

Or use your own fetcher (works with axios, custom clients, etc.):

```tsx
import { createAsyncStore } from "suspense-async-store";
import { use, Suspense } from "react";
import axios from "axios";

const api = createAsyncStore();

function UserDetails({ id }: { id: string }) {
  const user = use(
    api.get(["user", id], async ({ signal }) => {
      const res = await axios.get(`/api/users/${id}`, { signal });
      return res.data;
    })
  );
  return <div>{user.name}</div>;
}
```

## Why Cache Promises with Suspense?

When using React Suspense, **you must cache promise calls** to prevent infinite re-render loops. Here's why:

### The Problem: Without Caching

Without caching, each render creates a **new promise**, causing Suspense to suspend repeatedly:

```tsx
// ❌ This will cause infinite re-renders!
function UserDetails({ id }: { id: string }) {
  // Every render creates a NEW promise
  const promise = fetch(`/api/users/${id}`).then((res) => res.json());
  const user = use(promise); // Suspense suspends on this promise

  return <div>{user.name}</div>;
}
```

**What happens:**

1. Component renders → creates new promise → Suspense suspends
2. Promise resolves → component re-renders
3. Component renders again → creates **another new promise** → Suspense suspends again
4. **Infinite loop!** 🔄

### The Solution: With Caching

By caching promises by key, the **same promise** is returned for the same request:

```tsx
// ✅ This works correctly!
const api = createAsyncStore();

function UserDetails({ id }: { id: string }) {
  // Same key = same cached promise
  const user = use(
    api.get(["user", id], createJsonFetcher(`/api/users/${id}`))
  );

  return <div>{user.name}</div>;
}
```

**What happens:**

1. First render → creates promise, caches it by key `["user", id]` → Suspense suspends
2. Promise resolves → component re-renders
3. Second render → **returns the same cached promise** → Suspense recognizes it's already resolved → renders data
4. **Success!** ✅

### Key Takeaway

**Suspense needs stable promise references** to track loading state. Without caching, you get a new promise on every render, which Suspense treats as a new loading state, causing infinite loops. Caching ensures the same promise is reused for the same request, allowing Suspense to work correctly.

For React 18, use `useAsyncResource`:

```tsx
import { useAsyncResource } from "suspense-async-store/hooks";

function UserDetails({ id }: { id: string }) {
  const resource = useAsyncResource(api, ["user", id], async ({ signal }) => {
    const res = await fetch(`/api/users/${id}`, { signal });
    return res.json();
  });

  const user = resource.read();
  return <div>{user.name}</div>;
}
```

**Note:** The hooks are optional. If you don't use them with reference-counting strategy, the cleanup will still work based on the grace period, but may be less precise.

### Cleanup and Disposal

When you're done with a store (e.g., on app unmount or hot reload), call `dispose()` to clean up timers:

```ts
const api = createAsyncStore();

// ... use the store

// Clean up when done
api.dispose();
```

This is especially important in development with hot module reloading to prevent timer leaks.

### Best Practices

1. **Use reference-counting for most apps** - It provides the best balance of performance and memory safety
2. **Use hooks when possible** - They provide more precise cleanup with reference-counting
3. **Combine strategies** - Use different stores for different data types:

   ```ts
   // User data: reference-counting (keeps frequently-used data)
   const userStore = createAsyncStore({
     strategy: { type: "reference-counting" },
   });

   // Live prices: TTL (always fresh)
   const priceStore = createAsyncStore({
     strategy: { type: "ttl", ttl: 30000 },
   });

   // Images: LRU (bounded memory)
   const imageStore = createAsyncStore({
     strategy: { type: "lru", maxSize: 50 },
   });
   ```

4. **Call dispose() on unmount** - Prevents timer leaks in development and when dynamically creating stores
5. **Monitor cache size** - In production, monitor your cache behavior to tune strategy parameters

## Optional Fetch Helpers

The library provides optional helper functions for native `fetch` API. These are **completely optional** - the core library is framework-agnostic and works with any HTTP client.

Import fetch helpers separately:

```ts
import { createAsyncStore } from "suspense-async-store";
import { createJsonFetcher } from "suspense-async-store/fetch-helpers";
```

### `createJsonFetcher<T>(url, init?)`

Creates a fetcher for JSON responses with automatic error handling.

```tsx
import { createJsonFetcher } from "suspense-async-store/fetch-helpers";

const user = use(
  api.get(["user", id], createJsonFetcher<User>(`/api/users/${id}`))
);

// With custom headers
const user = use(
  api.get(
    ["user", id],
    createJsonFetcher<User>(`/api/users/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  )
);
```

### `createTextFetcher(url, init?)`

Creates a fetcher for text responses.

```tsx
import { createTextFetcher } from "suspense-async-store/fetch-helpers";

const content = use(
  api.get(["content", id], createTextFetcher(`/api/content/${id}`))
);
```

### `createBlobFetcher(url, init?)`

Creates a fetcher for binary data (Blob).

```tsx
import { createBlobFetcher } from "suspense-async-store/fetch-helpers";

const image = use(
  api.get(["image", id], createBlobFetcher(`/api/images/${id}`))
);
```

### `createPostJsonFetcher<TRequest, TResponse>(url, body, init?)`

Creates a fetcher for POST requests with JSON body.

```tsx
import { createPostJsonFetcher } from "suspense-async-store/fetch-helpers";

const result = use(
  api.get(
    ["create-user", userData],
    createPostJsonFetcher<UserData, User>("/api/users", userData)
  )
);
```

## Usage with React 19+

### Setup store

```ts
// api.ts (in the consumer app)
import { createAsyncStore } from "suspense-async-store";

// Default: automatic cleanup with reference-counting
export const api = createAsyncStore();

// Or configure a specific strategy:
// export const api = createAsyncStore({
//   strategy: { type: "lru", maxSize: 100 }
// });
```

### Component (Basic Usage)

```tsx
import React, { Suspense, use } from "react";
import { api } from "./api";
import { createJsonFetcher } from "suspense-async-store/fetch-helpers";

type User = { id: string; name: string };

function UserDetails({ id }: { id: string }) {
  // Using fetch helper (optional)
  const user = use(
    api.get(["user", id], createJsonFetcher<User>(`/api/users/${id}`))
  );

  // Or with custom fetcher (works with axios, custom clients, etc.)
  // const user = use(
  //   api.get<User>(["user", id], ({ signal }) =>
  //     fetch(`/api/users/${id}`, { signal }).then((res) => {
  //       if (!res.ok) throw new Error("Failed to fetch user");
  //       return res.json();
  //     })
  //   )
  // );

  return <div>User: {user.name}</div>;
}

export function UserPage({ id }: { id: string }) {
  return (
    <Suspense fallback={<div>Loading user…</div>}>
      <UserDetails id={id} />
    </Suspense>
  );
}
```

### Component (With Automatic Lifecycle Tracking)

For optimal memory management with reference-counting strategy, use the provided hooks:

```tsx
import React, { Suspense, use } from "react";
import { api } from "./api";
import { useAsyncValue } from "suspense-async-store/hooks";
import { createJsonFetcher } from "suspense-async-store/fetch-helpers";

type User = { id: string; name: string };

function UserDetails({ id }: { id: string }) {
  // Automatically registers/unregisters this component's usage
  const userPromise = useAsyncValue(
    api,
    ["user", id],
    createJsonFetcher<User>(`/api/users/${id}`)
  );

  const user = use(userPromise);
  return <div>User: {user.name}</div>;
}

export function UserPage({ id }: { id: string }) {
  return (
    <Suspense fallback={<div>Loading user…</div>}>
      <UserDetails id={id} />
    </Suspense>
  );
}
```

### Error handling & retry (React 19)

```tsx
import React, { Suspense, use } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { api } from "suspense-async-store";
import { createJsonFetcher } from "suspense-async-store/fetch-helpers";

function UserDetails({ id }: { id: string }) {
  const user = use(
    api.get(["user", id], createJsonFetcher<User>(`/api/users/${id}`))
  );
  return <div>User: {user.name}</div>;
}

function UserErrorFallback({
  error,
  resetErrorBoundary,
  userId,
}: {
  error: Error;
  resetErrorBoundary: () => void;
  userId: string;
}) {
  return (
    <div>
      <p>Oops: {error.message}</p>
      <button
        onClick={() => {
          api.invalidate(["user", userId]); // abort + clear cache
          resetErrorBoundary(); // retry render
        }}
      >
        Retry
      </button>
    </div>
  );
}

export function UserPage({ id }: { id: string }) {
  return (
    <ErrorBoundary
      FallbackComponent={(props) => (
        <UserErrorFallback {...props} userId={id} />
      )}
    >
      <Suspense fallback={<div>Loading user…</div>}>
        <UserDetails id={id} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

## Usage with React 18

In React 18 there is no `use()` data hook, but Suspense still works if you
throw a Promise or Error from render. `getResource().read()` implements that.

### Component (Basic Usage)

```tsx
import React, { Suspense } from "react";
import { api } from "./api";
import { createJsonFetcher } from "suspense-async-store/fetch-helpers";

type User = { id: string; name: string };

function UserDetails({ id }: { id: string }) {
  // Using fetch helper (optional)
  const resource = api.getResource(
    ["user", id],
    createJsonFetcher<User>(`/api/users/${id}`)
  );

  // Or with custom fetcher (works with axios, custom clients, etc.)
  // const resource = api.getResource<User>(["user", id], async ({ signal }) => {
  //   const res = await fetch(`/api/users/${id}`, { signal });
  //   if (!res.ok) throw new Error("Failed to fetch user");
  //   return res.json();
  // });

  const user = resource.read(); // may throw Promise or Error
  return <div>User: {user.name}</div>;
}

export function UserPage({ id }: { id: string }) {
  return (
    <Suspense fallback={<div>Loading user…</div>}>
      <UserDetails id={id} />
    </Suspense>
  );
}
```

### Component (With Automatic Lifecycle Tracking)

For optimal memory management with reference-counting strategy, use the provided hooks:

```tsx
import React, { Suspense } from "react";
import { api } from "./api";
import { useAsyncResource } from "suspense-async-store/hooks";
import { createJsonFetcher } from "suspense-async-store/fetch-helpers";

type User = { id: string; name: string };

function UserDetails({ id }: { id: string }) {
  // Automatically registers/unregisters this component's usage
  const resource = useAsyncResource(
    api,
    ["user", id],
    createJsonFetcher<User>(`/api/users/${id}`)
  );

  const user = resource.read();
  return <div>User: {user.name}</div>;
}

export function UserPage({ id }: { id: string }) {
  return (
    <Suspense fallback={<div>Loading user…</div>}>
      <UserDetails id={id} />
    </Suspense>
  );
}
```

### Error handling & retry (React 18)

```tsx
import React, { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { api } from "suspense-async-store";
import { createJsonFetcher } from "suspense-async-store/fetch-helpers";

function UserDetails({ id }: { id: string }) {
  const resource = api.getResource(
    ["user", id],
    createJsonFetcher<User>(`/api/users/${id}`)
  );

  const user = resource.read(); // Suspense + ErrorBoundary
  return <div>User: {user.name}</div>;
}

function UserErrorFallback({
  error,
  resetErrorBoundary,
  userId,
}: {
  error: Error;
  resetErrorBoundary: () => void;
  userId: string;
}) {
  return (
    <div>
      <p>Oops: {error.message}</p>
      <button
        onClick={() => {
          api.invalidate(["user", userId]);
          resetErrorBoundary();
        }}
      >
        Retry
      </button>
    </div>
  );
}

export function UserPage({ id }: { id: string }) {
  return (
    <ErrorBoundary
      FallbackComponent={(props) => (
        <UserErrorFallback {...props} userId={id} />
      )}
    >
      <Suspense fallback={<div>Loading user…</div>}>
        <UserDetails id={id} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

## API Reference

### `createAsyncStore(config?)`

Creates a new async store instance with optional configuration.

**Parameters:**

- `config?: AsyncStoreConfig` - Optional configuration object
  - `strategy?: CacheStrategy` - Cache management strategy (default: reference-counting)

**Returns:** Store instance with methods:

- `get<T>(key, fetcher): Promise<T>` - Get cached promise (for React 19+ with `use()`)
- `getResource<T>(key, fetcher): Resource<T>` - Get Suspense resource (for React 18)
- `invalidate(key): void` - Invalidate a specific cache entry
- `clear(): void` - Clear entire cache
- `dispose(): void` - Clean up timers and resources
- `addReference(key, ref): void` - Internal: add component reference
- `removeReference(key, ref): void` - Internal: remove component reference

### Cache Strategies

#### Reference Counting (Default)

```ts
{
  type: "reference-counting",
  cleanupInterval?: number,  // Cleanup check interval in ms (default: 5000)
  gracePeriod?: number       // Wait before cleanup in ms (default: 1000)
}
```

#### LRU (Least Recently Used)

```ts
{
  type: "lru",
  maxSize: number  // Maximum number of entries to keep
}
```

#### TTL (Time To Live)

```ts
{
  type: "ttl",
  ttl: number,              // Entry lifetime in ms
  cleanupInterval?: number  // Cleanup check interval in ms (default: ttl / 2)
}
```

#### Manual

```ts
{
  type: "manual"; // No automatic cleanup
}
```

### React Hooks

Import from `"suspense-async-store/hooks"`:

#### `useAsyncValue<T>(store, key, fetcher): Promise<T>`

React 19+ hook that manages lifecycle and returns a promise for use with `use()`.

**Parameters:**

- `store: AsyncStore` - The store instance
- `key: Key` - Cache key (string or array)
- `fetcher: Fetcher<T>` - Async function to fetch data

**Returns:** `Promise<T>` - Promise to use with React's `use()` hook

#### `useAsyncResource<T>(store, key, fetcher): Resource<T>`

React 18 hook that manages lifecycle and returns a Suspense resource.

**Parameters:**

- `store: AsyncStore` - The store instance
- `key: Key` - Cache key (string or array)
- `fetcher: Fetcher<T>` - Async function to fetch data

**Returns:** `Resource<T>` - Resource with `.read()` method

### Fetch Helpers

Import from `"suspense-async-store/fetch-helpers"`:

- `createJsonFetcher<T>(url, init?)` - Fetch and parse JSON
- `createTextFetcher(url, init?)` - Fetch text content
- `createBlobFetcher(url, init?)` - Fetch binary data
- `createPostJsonFetcher<TReq, TRes>(url, body, init?)` - POST with JSON body

All helpers support AbortSignal and custom RequestInit options.

## TypeScript Support

Fully typed with TypeScript. All types are exported:

```ts
import type {
  Key,
  FetchContext,
  Fetcher,
  Resource,
  CacheStrategy,
  AsyncStoreConfig,
} from "suspense-async-store";

import type { AsyncStore } from "suspense-async-store/hooks";
```

## Migration from 0.3.x

Version 0.4.0 adds automatic memory management but remains backward compatible:

- **No breaking changes** - Existing code works without modifications
- **Default behavior changed** - Now uses reference-counting strategy by default (was manual)
- **New APIs added** - `dispose()`, configuration, and React hooks

To preserve old behavior (manual cleanup):

```ts
const api = createAsyncStore({ strategy: { type: "manual" } });
```

## License

ISC

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/youryss/suspense-async-store).

```

```
