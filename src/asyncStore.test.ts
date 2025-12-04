import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAsyncStore } from "./asyncStore";

describe("createAsyncStore", () => {
  let store: ReturnType<typeof createAsyncStore>;

  beforeEach(() => {
    store = createAsyncStore();
  });

  describe("get", () => {
    it("should fetch and cache data", async () => {
      const fetcher = vi.fn(async () => "test-data");
      const key = "test-key";

      const result1 = await store.get(key, fetcher);
      const result2 = await store.get(key, fetcher);

      expect(result1).toBe("test-data");
      expect(result2).toBe("test-data");
      expect(fetcher).toHaveBeenCalledTimes(1); // Should be cached
    });

    it("should pass AbortSignal to fetcher", async () => {
      const fetcher = vi.fn(async ({ signal }) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        return "data";
      });

      await store.get("key", fetcher);
      expect(fetcher).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("should handle different keys separately", async () => {
      const fetcher1 = vi.fn(async () => "data1");
      const fetcher2 = vi.fn(async () => "data2");

      const result1 = await store.get("key1", fetcher1);
      const result2 = await store.get("key2", fetcher2);

      expect(result1).toBe("data1");
      expect(result2).toBe("data2");
      expect(fetcher1).toHaveBeenCalledTimes(1);
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    it("should handle array keys", async () => {
      const fetcher = vi.fn(async () => "data");
      const key = ["users", "123"];

      const result = await store.get(key, fetcher);
      expect(result).toBe("data");
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Same array key should use cache
      const result2 = await store.get(key, fetcher);
      expect(result2).toBe("data");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("should handle errors and remove from cache on abort", async () => {
      const fetcher = vi.fn(async ({ signal }) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve("data");
          }, 100);

          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });

      const promise = store.get("key", fetcher);
      store.invalidate("key");

      await expect(promise).rejects.toThrow();
      expect(fetcher).toHaveBeenCalled();

      // Should refetch after invalidate
      const fetcher2 = vi.fn(async () => "new-data");
      const result = await store.get("key", fetcher2);
      expect(result).toBe("new-data");
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    it("should handle non-abort errors", async () => {
      const error = new Error("Network error");
      const fetcher = vi.fn(async () => {
        throw error;
      });

      await expect(store.get("key", fetcher)).rejects.toThrow("Network error");

      // Should still cache the rejected promise
      await expect(store.get("key", fetcher)).rejects.toThrow("Network error");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe("getResource", () => {
    it("should return a Resource that throws Promise while pending", async () => {
      let resolvePromise: (value: string) => void;
      const promise = new Promise<string>((resolve) => {
        resolvePromise = resolve;
      });

      const fetcher = vi.fn(async () => promise);
      const resource = store.getResource("key", fetcher);

      // read() should throw the promise while pending
      expect(() => resource.read()).toThrow();

      // Resolve the promise
      resolvePromise!("data");

      // Wait for promise to resolve
      await promise;

      // Now read() should return the value
      // We need to wait a bit for the resource to update
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(resource.read()).toBe("data");
    });

    it("should return value when promise resolves", async () => {
      const fetcher = vi.fn(async () => "test-data");
      const resource = store.getResource("key", fetcher);

      // Wait for promise to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(resource.read()).toBe("test-data");
    });

    it("should throw error when promise rejects", async () => {
      const error = new Error("Test error");
      const fetcher = vi.fn(async () => {
        throw error;
      });

      const resource = store.getResource("key", fetcher);

      // Wait for promise to reject
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(() => resource.read()).toThrow("Test error");
    });

    it("should cache Resource results", async () => {
      const fetcher = vi.fn(async () => "cached-data");
      const resource1 = store.getResource("key", fetcher);
      const resource2 = store.getResource("key", fetcher);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(resource1.read()).toBe("cached-data");
      expect(resource2.read()).toBe("cached-data");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalidate", () => {
    it("should abort in-flight request and remove from cache", async () => {
      let abortCalled = false;
      const fetcher = vi.fn(async ({ signal }) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve("data");
          }, 100);

          signal.addEventListener("abort", () => {
            abortCalled = true;
            clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });

      const promise = store.get("key", fetcher);
      store.invalidate("key");

      await expect(promise).rejects.toThrow();
      expect(abortCalled).toBe(true);

      // Should be able to fetch again
      const fetcher2 = vi.fn(async () => "new-data");
      const result = await store.get("key", fetcher2);
      expect(result).toBe("new-data");
    });

    it("should handle invalidating non-existent key", () => {
      expect(() => store.invalidate("non-existent")).not.toThrow();
    });

    it("should handle array keys", async () => {
      const fetcher = vi.fn(async () => "data");
      await store.get(["users", "123"], fetcher);

      store.invalidate(["users", "123"]);

      const fetcher2 = vi.fn(async () => "new-data");
      const result = await store.get(["users", "123"], fetcher2);
      expect(result).toBe("new-data");
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });
  });

  describe("clear", () => {
    it("should abort all in-flight requests and clear cache", async () => {
      let abortCount = 0;
      const createFetcher = (id: string) =>
        vi.fn(async ({ signal }) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve(`data-${id}`);
            }, 100);

            signal.addEventListener("abort", () => {
              abortCount++;
              clearTimeout(timeout);
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
        });

      const promise1 = store.get("key1", createFetcher("1"));
      const promise2 = store.get("key2", createFetcher("2"));

      store.clear();

      await expect(promise1).rejects.toThrow();
      await expect(promise2).rejects.toThrow();
      expect(abortCount).toBe(2);

      // Cache should be empty
      const fetcher3 = vi.fn(async () => "new-data");
      const result = await store.get("key1", fetcher3);
      expect(result).toBe("new-data");
      expect(fetcher3).toHaveBeenCalledTimes(1);
    });

    it("should handle clear on empty cache", () => {
      expect(() => store.clear()).not.toThrow();
    });
  });

  describe("AbortController integration", () => {
    it("should abort when signal is aborted", async () => {
      const fetcher = vi.fn(async ({ signal }) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve("data");
          }, 50);

          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });

      const promise = store.get("key", fetcher);
      store.invalidate("key");

      await expect(promise).rejects.toThrow();
    });

    it("should handle axios-style abort errors", async () => {
      const axiosError = { code: "ERR_CANCELED", message: "Canceled" };
      const fetcher = vi.fn(async ({ signal }) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve("data");
          }, 100);

          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(axiosError);
          });
        });
      });

      const promise = store.get("key", fetcher);
      store.invalidate("key");

      await expect(promise).rejects.toEqual(axiosError);

      // Should be removed from cache
      const fetcher2 = vi.fn(async () => "new-data");
      const result = await store.get("key", fetcher2);
      expect(result).toBe("new-data");
    });
  });

  describe("dispose", () => {
    it("should stop cleanup timers and clear cache", async () => {
      const store = createAsyncStore({
        strategy: { type: "reference-counting", cleanupInterval: 100 },
      });

      const fetcher = vi.fn(async () => "data");
      await store.get("key", fetcher);

      store.dispose();

      // Cache should be cleared
      const fetcher2 = vi.fn(async () => "new-data");
      const result = await store.get("key", fetcher2);
      expect(result).toBe("new-data");
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    it("should handle dispose on manual strategy", () => {
      const store = createAsyncStore({ strategy: { type: "manual" } });
      expect(() => store.dispose()).not.toThrow();
    });
  });

  describe("Cache Strategies", () => {
    describe("reference-counting strategy", () => {
      it("should be the default strategy", async () => {
        const store = createAsyncStore();
        const fetcher = vi.fn(async () => "data");
        await store.get("key", fetcher);
        expect(fetcher).toHaveBeenCalledTimes(1);
      });

      it("should track references", async () => {
        const store = createAsyncStore({
          strategy: { type: "reference-counting", cleanupInterval: 100 },
        });

        const fetcher = vi.fn(async () => "data");
        await store.get("key", fetcher);

        const ref1 = {};
        const ref2 = {};

        store.addReference("key", ref1);
        store.addReference("key", ref2);

        // Data should still be cached
        await store.get("key", fetcher);
        expect(fetcher).toHaveBeenCalledTimes(1);

        store.dispose();
      });

      it("should remove references", async () => {
        const store = createAsyncStore({
          strategy: { type: "reference-counting", cleanupInterval: 100 },
        });

        const fetcher = vi.fn(async () => "data");
        await store.get("key", fetcher);

        const ref = {};
        store.addReference("key", ref);
        store.removeReference("key", ref);

        store.dispose();
      });

      it("should clean up unreferenced entries after grace period", async () => {
        const store = createAsyncStore({
          strategy: {
            type: "reference-counting",
            cleanupInterval: 50,
            gracePeriod: 100,
          },
        });

        const fetcher = vi.fn(async () => "data");
        await store.get("key", fetcher);

        // Wait for cleanup interval + grace period
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Should be cleaned up and refetch
        const fetcher2 = vi.fn(async () => "new-data");
        const result = await store.get("key", fetcher2);
        expect(result).toBe("new-data");
        expect(fetcher2).toHaveBeenCalledTimes(1);

        store.dispose();
      });
    });

    describe("LRU strategy", () => {
      it("should evict least recently used entries when max size reached", async () => {
        const store = createAsyncStore({
          strategy: { type: "lru", maxSize: 2 },
        });

        const fetcher1 = vi.fn(async () => "data1");
        const fetcher2 = vi.fn(async () => "data2");
        const fetcher3 = vi.fn(async () => "data3");

        await store.get("key1", fetcher1);
        await store.get("key2", fetcher2);
        expect(fetcher1).toHaveBeenCalledTimes(1);
        expect(fetcher2).toHaveBeenCalledTimes(1);

        // Adding key3 should evict key1 (least recently used)
        await store.get("key3", fetcher3);
        expect(fetcher3).toHaveBeenCalledTimes(1);

        // key2 and key3 should still be cached
        await store.get("key2", fetcher2);
        await store.get("key3", fetcher3);
        expect(fetcher2).toHaveBeenCalledTimes(1);
        expect(fetcher3).toHaveBeenCalledTimes(1);

        // key1 should be evicted, so it should refetch
        const fetcher1Again = vi.fn(async () => "data1-new");
        await store.get("key1", fetcher1Again);
        expect(fetcher1Again).toHaveBeenCalledTimes(1);
      });

      it("should update last accessed time on cache hit", async () => {
        const store = createAsyncStore({
          strategy: { type: "lru", maxSize: 2 },
        });

        const fetcher1 = vi.fn(async () => "data1");
        const fetcher2 = vi.fn(async () => "data2");
        const fetcher3 = vi.fn(async () => "data3");

        await store.get("key1", fetcher1);
        await store.get("key2", fetcher2);
        expect(fetcher1).toHaveBeenCalledTimes(1);
        expect(fetcher2).toHaveBeenCalledTimes(1);

        // Access key1 again to make it more recently used
        await store.get("key1", fetcher1);
        expect(fetcher1).toHaveBeenCalledTimes(1); // Still cached

        // Now key3 should evict key2 (least recently used)
        await store.get("key3", fetcher3);

        // key1 and key3 should be cached
        await store.get("key1", fetcher1);
        await store.get("key3", fetcher3);
        expect(fetcher1).toHaveBeenCalledTimes(1);
        expect(fetcher3).toHaveBeenCalledTimes(1);

        // key2 should be evicted
        const fetcher2Again = vi.fn(async () => "data2-new");
        await store.get("key2", fetcher2Again);
        expect(fetcher2Again).toHaveBeenCalledTimes(1);
      });
    });

    describe("TTL strategy", () => {
      it("should expire entries after TTL", async () => {
        const store = createAsyncStore({
          strategy: { type: "ttl", ttl: 100, cleanupInterval: 50 },
        });

        const fetcher = vi.fn(async () => "data");
        await store.get("key", fetcher);
        expect(fetcher).toHaveBeenCalledTimes(1);

        // Access before TTL expires
        await new Promise((resolve) => setTimeout(resolve, 50));
        await store.get("key", fetcher);
        expect(fetcher).toHaveBeenCalledTimes(1); // Still cached

        // Wait for TTL to expire
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should refetch after TTL
        const fetcher2 = vi.fn(async () => "new-data");
        const result = await store.get("key", fetcher2);
        expect(result).toBe("new-data");
        expect(fetcher2).toHaveBeenCalledTimes(1);

        store.dispose();
      });

      it("should clean up expired entries in background", async () => {
        const store = createAsyncStore({
          strategy: { type: "ttl", ttl: 50, cleanupInterval: 30 },
        });

        const fetcher = vi.fn(async () => "data");
        await store.get("key", fetcher);

        // Wait for cleanup to run
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should refetch
        const fetcher2 = vi.fn(async () => "new-data");
        await store.get("key", fetcher2);
        expect(fetcher2).toHaveBeenCalledTimes(1);

        store.dispose();
      });
    });

    describe("manual strategy", () => {
      it("should not automatically clean up entries", async () => {
        const store = createAsyncStore({ strategy: { type: "manual" } });

        const fetcher = vi.fn(async () => "data");
        await store.get("key", fetcher);

        // Wait to ensure no cleanup happens
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Should still be cached
        await store.get("key", fetcher);
        expect(fetcher).toHaveBeenCalledTimes(1);
      });

      it("should require manual invalidation", async () => {
        const store = createAsyncStore({ strategy: { type: "manual" } });

        const fetcher = vi.fn(async () => "data");
        await store.get("key", fetcher);

        // Manually invalidate
        store.invalidate("key");

        // Should refetch
        const fetcher2 = vi.fn(async () => "new-data");
        await store.get("key", fetcher2);
        expect(fetcher2).toHaveBeenCalledTimes(1);
      });
    });
  });
});
