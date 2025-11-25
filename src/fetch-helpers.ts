// src/fetch-helpers.ts
// Optional fetch-specific helper utilities.
// Import from "suspense-async-store/fetch-helpers" if you want to use fetch.

import type { FetchContext, Fetcher } from "./asyncStore";

/**
 * Creates a fetcher that uses native fetch to get JSON data.
 * Automatically handles error responses and JSON parsing.
 *
 * @template T - The type of the JSON response
 * @param url - The URL to fetch from
 * @param init - Optional fetch init options (will be merged with signal)
 * @returns A fetcher function
 *
 * @example
 * ```ts
 * import { createAsyncStore } from "suspense-async-store";
 * import { createJsonFetcher } from "suspense-async-store/fetch-helpers";
 *
 * const api = createAsyncStore();
 *
 * // React 19+
 * const user = use(
 *   api.get(["user", id], createJsonFetcher<User>(`/api/users/${id}`))
 * );
 *
 * // With custom headers
 * const user = use(
 *   api.get(
 *     ["user", id],
 *     createJsonFetcher<User>(`/api/users/${id}`, {
 *       headers: { Authorization: `Bearer ${token}` },
 *     })
 *   )
 * );
 * ```
 */
export function createJsonFetcher<T>(
  url: string,
  init?: Omit<RequestInit, "signal">
): Fetcher<T> {
  return async ({ signal }: FetchContext) => {
    const response = await fetch(url, { ...init, signal });
    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}: ${response.statusText}`
      );
    }
    return response.json() as Promise<T>;
  };
}

/**
 * Creates a fetcher that uses native fetch to get text data.
 *
 * @param url - The URL to fetch from
 * @param init - Optional fetch init options (will be merged with signal)
 * @returns A fetcher function
 *
 * @example
 * ```ts
 * import { createAsyncStore } from "suspense-async-store";
 * import { createTextFetcher } from "suspense-async-store/fetch-helpers";
 *
 * const api = createAsyncStore();
 * const content = use(
 *   api.get(["content", id], createTextFetcher(`/api/content/${id}`))
 * );
 * ```
 */
export function createTextFetcher(
  url: string,
  init?: Omit<RequestInit, "signal">
): Fetcher<string> {
  return async ({ signal }: FetchContext) => {
    const response = await fetch(url, { ...init, signal });
    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}: ${response.statusText}`
      );
    }
    return response.text();
  };
}

/**
 * Creates a fetcher that uses native fetch to get binary data (Blob).
 *
 * @param url - The URL to fetch from
 * @param init - Optional fetch init options (will be merged with signal)
 * @returns A fetcher function
 *
 * @example
 * ```ts
 * import { createAsyncStore } from "suspense-async-store";
 * import { createBlobFetcher } from "suspense-async-store/fetch-helpers";
 *
 * const api = createAsyncStore();
 * const image = use(
 *   api.get(["image", id], createBlobFetcher(`/api/images/${id}`))
 * );
 * ```
 */
export function createBlobFetcher(
  url: string,
  init?: Omit<RequestInit, "signal">
): Fetcher<Blob> {
  return async ({ signal }: FetchContext) => {
    const response = await fetch(url, { ...init, signal });
    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}: ${response.statusText}`
      );
    }
    return response.blob();
  };
}

/**
 * Creates a fetcher that performs a POST request with JSON body.
 *
 * @template TRequest - The type of the request body
 * @template TResponse - The type of the response body
 * @param url - The URL to POST to
 * @param body - The JSON body to send
 * @param init - Optional fetch init options (will be merged with signal and body)
 * @returns A fetcher function
 *
 * @example
 * ```ts
 * import { createAsyncStore } from "suspense-async-store";
 * import { createPostJsonFetcher } from "suspense-async-store/fetch-helpers";
 *
 * const api = createAsyncStore();
 * const result = use(
 *   api.get(
 *     ["create-user", userData],
 *     createPostJsonFetcher<User, CreateUserResponse>("/api/users", userData)
 *   )
 * );
 * ```
 */
export function createPostJsonFetcher<TRequest, TResponse = TRequest>(
  url: string,
  body: TRequest,
  init?: Omit<RequestInit, "signal" | "method" | "body">
): Fetcher<TResponse> {
  return async ({ signal }: FetchContext) => {
    const response = await fetch(url, {
      ...init,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}: ${response.statusText}`
      );
    }
    return response.json() as Promise<TResponse>;
  };
}
