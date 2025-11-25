# suspense-async-store

A tiny async store for React Suspense:

- **Framework-agnostic core** - Works with any fetch client (fetch, axios, etc.)
- Supports AbortController / AbortSignal
- Supports:
  - **React 19+:** `use(store.get(key, fetcher))`
  - **React 18:** `store.getResource(key, fetcher).read()`
- Optional fetch helpers available as a separate import

## Installation

```bash
npm install suspense-async-store
```

## Quick Start

```tsx
import { createAsyncStore } from "suspense-async-store";
import { createJsonFetcher } from "suspense-async-store/fetch-helpers";
import { use, Suspense } from "react";

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

export const api = createAsyncStore();
```

### Component

```tsx
import React, { Suspense, use } from "react";
import { api } from "suspense-async-store";
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

### Component

```tsx
import React, { Suspense } from "react";
import { api } from "suspense-async-store";
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
