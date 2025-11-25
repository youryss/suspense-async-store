# suspense-async-store

A tiny async store for React Suspense:

- Framework-agnostic core
- Works with any fetch client (fetch, axios, etc.)
- Supports AbortController / AbortSignal
- Supports:
  - **React 19+:** `use(store.get(key, fetcher))`
  - **React 18:** `store.getResource(key, fetcher).read()`

See [docs/USAGE.md](./docs/USAGE.md) for examples with React 18 and 19.
