# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-11-25

### Added

- Initial release
- Core `createAsyncStore()` function with Promise and Resource APIs
- Support for React 19+ via `use(store.get(key, fetcher))`
- Support for React 18 via `store.getResource(key, fetcher).read()`
- AbortController/AbortSignal support for request cancellation
- Cache invalidation with `invalidate()` and `clear()` methods
- Optional fetch helpers (`createJsonFetcher`, `createTextFetcher`, `createBlobFetcher`, `createPostJsonFetcher`)
- TypeScript support with full type definitions
- Comprehensive test suite with 100% coverage
- ESLint and Prettier configuration
- Pre-commit hooks with Husky
