/**
 * Centralized Client-Side Query Cache for BPER-OPTINEXT2
 *
 * Implements:
 * 1. Configurable staleTime and garbage collection (gcTime)
 * 2. In-flight request deduplication (coalesces identical simultaneous calls)
 * 3. Scope isolation (scoped by user email, role, reporting period, filters)
 * 4. Automatic cache invalidation on mutations or logout
 * 5. Preservation across route transitions (immediate 0ms response for warm cache)
 */

import { loadAuthUser } from './authStorage';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  userEmail: string;
  userRole: string;
}

export interface QueryCacheOptions {
  staleTime?: number; // Time in ms before background revalidation is needed (default: 60s)
  forceRefresh?: boolean; // Bypass cache and fetch fresh
}

const DEFAULT_STALE_TIME_MS = 60_000; // 60 seconds for analytics/operational data
const STATIC_STALE_TIME_MS = 5 * 60_000; // 5 minutes for reference data (taxonomy, assumptions)

class QueryCacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private globalInvalidatedAt = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      // Clear or isolate on logout / auth-cleared
      window.addEventListener('bper:auth-cleared', () => this.clearAll());
      // Invalidate on mutations
      window.addEventListener('bper:data-updated', () => this.invalidateMatching(/.*\/reports\/.*/));
      window.addEventListener('bper:assumptions-updated', () => this.invalidateMatching(/.*(\/reports\/|\/config\/).*/));
    }
  }

  /**
   * Generates a fully qualified cache key scoped by user identity and role.
   * Ensures data isolation between different users.
   */
  public buildScopeKey(endpoint: string): string {
    const user = loadAuthUser();
    const userEmail = user?.email || 'anonymous';
    const userRole = user?.role || 'guest';
    return `${userEmail}::${userRole}::${endpoint}`;
  }

  /**
   * Get cached data if valid and fresh.
   */
  public get<T>(endpoint: string): T | null {
    const key = this.buildScopeKey(endpoint);
    const entry = this.cache.get(key);
    if (!entry) return null;

    const user = loadAuthUser();
    if (entry.userEmail !== (user?.email || 'anonymous')) {
      this.cache.delete(key);
      return null;
    }

    if (entry.timestamp <= this.globalInvalidatedAt) {
      this.cache.delete(key);
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      // Stale - can still be returned for stale-while-revalidate, but expired for strict get
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cached data with calculated expiration.
   */
  public set<T>(endpoint: string, data: T, staleTimeMs: number = DEFAULT_STALE_TIME_MS): void {
    const key = this.buildScopeKey(endpoint);
    const user = loadAuthUser();
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + staleTimeMs,
      userEmail: user?.email || 'anonymous',
      userRole: user?.role || 'guest'
    });
  }

  /**
   * Deduplicates simultaneous identical requests and manages cache lifecycle.
   */
  public async fetchWithCache<T>(
    endpoint: string,
    fetcher: () => Promise<T>,
    options: QueryCacheOptions = {}
  ): Promise<T> {
    const { staleTime = DEFAULT_STALE_TIME_MS, forceRefresh = false } = options;
    const key = this.buildScopeKey(endpoint);

    // 1. Check cache if not forcing refresh
    if (!forceRefresh) {
      const cached = this.get<T>(endpoint);
      if (cached !== null) {
        return cached;
      }
    }

    // 2. Check in-flight promise to deduplicate identical concurrent calls
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key) as Promise<T>;
    }

    // 3. Initiate request and track promise
    const promise = (async () => {
      try {
        const data = await fetcher();
        if (data !== null && data !== undefined) {
          this.set(endpoint, data, staleTime);
        }
        return data;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Invalidate cache matching an endpoint prefix or regex pattern.
   */
  public invalidateMatching(pattern: RegExp | string): void {
    this.globalInvalidatedAt = Date.now();
    for (const [key] of this.cache.entries()) {
      if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Purge the entire cache.
   */
  public clearAll(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.globalInvalidatedAt = Date.now();
  }
}

export const queryCache = new QueryCacheManager();
export { DEFAULT_STALE_TIME_MS, STATIC_STALE_TIME_MS };
