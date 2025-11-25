# suspense-async-store

A tiny async store for React Suspense:

- Framework-agnostic core
- Works with any fetch client (fetch, axios, etc.)
- Supports AbortController / AbortSignal
- Supports:
  - **React 19+:** `use(store.get(key, fetcher))`
  - **React 18:** `store.getResource(key, fetcher).read()`

## Usage with React 19+

### Setup store

```ts
// api.ts (in the consumer app)
import { createAsyncStore, type Key } from "suspense-async-store";

export const api = createAsyncStore();

/**
 * Optional JSON helper for fetch.
 */
export function getJson<T>(key: Key, url: string, init?: RequestInit) {
  return api.get<T>(key, async ({ signal }) => {
    const res = await fetch(url, { ...init, signal });
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    return res.json();
  });
}
```

### Component

```tsx
import React, { Suspense, use } from "react";
import { api } from "./api";

type User = { id: string; name: string };

function UserDetails({ id }: { id: string }) {
  const user = use(
    api.get<User>(["user", id], ({ signal }) =>
      fetch(`/api/users/${id}`, { signal }).then((res) => {
        if (!res.ok) throw new Error("Failed to fetch user");
        return res.json();
      })
    )
  );

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
import { api } from "./api";

function UserDetails({ id }: { id: string }) {
  const user = use(
    api.get<User>(["user", id], ({ signal }) =>
      fetch(`/api/users/${id}`, { signal }).then((res) => {
        if (!res.ok) throw new Error("Failed to fetch user");
        return res.json();
      })
    )
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
          resetErrorBoundary();             // retry render
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

### Component

```tsx
import React, { Suspense } from "react";
import { api } from "./api"; // same api as React 19 example

type User = { id: string; name: string };

function UserDetails({ id }: { id: string }) {
  const resource = api.getResource<User>(["user", id], async ({ signal }) => {
    const res = await fetch(`/api/users/${id}`, { signal });
    if (!res.ok) throw new Error("Failed to fetch user");
    return res.json();
  });

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

### Error handling & retry (React 18)

```tsx
import React, { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { api } from "./api";

function UserDetails({ id }: { id: string }) {
  const resource = api.getResource<User>(["user", id], async ({ signal }) => {
    const res = await fetch(`/api/users/${id}`, { signal });
    if (!res.ok) throw new Error("Failed to fetch user");
    return res.json();
  });

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
