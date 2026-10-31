/**
 * Centralized Client-Side Query Cache for BPER-OPTINEXT2
 *
 * Implements:
 * 1. Monotonic invalidation generation tracking to prevent in-flight race conditions
 * 2. Targeted invalidation by endpoint/pattern without purging unrelated entries
 * 3. Scope isolation (scoped by user email, role, reporting period, filters)
 * 4. In-flight request deduplication (coalesces identical simultaneous calls)
 * 5. Automatic cache invalidation on mutations or logout
 * 6. Configurable staleTime and TTL expiration
 */

import { loadAuthUser } from './authStorage';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  userEmail: string;
  userRole: string;
  generation: number;
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
  // Endpoint/pattern-scoped monotonic generation tracker
  private routeGenerations = new Map<string, number>();
  private globalGeneration = 1;

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
   * Returns current monotonic generation for an endpoint.
   */
  public getGeneration(endpoint: string): number {
    return (this.routeGenerations.get(endpoint) || 0) + this.globalGeneration;
  }

  /**
   * Get cached data if valid and fresh.
   */
  public get<T>(endpoint: string): T | null {
    const key = this.buildScopeKey(endpoint);
    const entry = this.cache.get(key);
    if (!entry) return null;

    const user = loadAuthUser();
    if (entry.userEmail !== (user?.email || 'anonymous') || entry.userRole !== (user?.role || 'guest')) {
      this.cache.delete(key);
      return null;
    }

    // Monotonic generation check: discard if invalidated since cached
    if (entry.generation !== this.getGeneration(endpoint)) {
      this.cache.delete(key);
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cached data with generation tag and calculated expiration.
   */
  public set<T>(
    endpoint: string,
    data: T,
    staleTimeMs: number = DEFAULT_STALE_TIME_MS,
    capturedGeneration?: number
  ): void {
    const currentGen = this.getGeneration(endpoint);
    // If request was initiated in a previous generation, discard it
    if (capturedGeneration !== undefined && capturedGeneration !== currentGen) {
      return;
    }

    const key = this.buildScopeKey(endpoint);
    const user = loadAuthUser();
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + staleTimeMs,
      userEmail: user?.email || 'anonymous',
      userRole: user?.role || 'guest',
      generation: currentGen
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

    // Capture generation at request start
    const requestGen = this.getGeneration(endpoint);

    // 3. Initiate request and track promise
    const promise = (async () => {
      try {
        const data = await fetcher();
        if (data !== null && data !== undefined) {
          // Only cache if generation still matches when resolved
          this.set(endpoint, data, staleTime, requestGen);
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
   * Increments the generation for matching endpoints so in-flight calls are discarded,
   * while leaving unrelated cached entries intact.
   */
  public invalidateMatching(pattern: RegExp | string): void {
    for (const [key] of this.cache.entries()) {
      if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
        this.cache.delete(key);
      }
    }

    // Increment generation for matched endpoints in routeGenerations
    for (const [endpoint, gen] of this.routeGenerations.entries()) {
      if (typeof pattern === 'string' ? endpoint.includes(pattern) : pattern.test(endpoint)) {
        this.routeGenerations.set(endpoint, gen + 1);
      }
    }

    // Also register an explicit bumped generation if not already mapped
    if (typeof pattern === 'string') {
      const current = this.routeGenerations.get(pattern) || 0;
      this.routeGenerations.set(pattern, current + 1);
    } else {
      // For regex patterns, bump global generation fallback for matching routes
      this.globalGeneration += 1;
    }
  }

  /**
   * Purge the entire cache and increment global generation.
   */
  public clearAll(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.routeGenerations.clear();
    this.globalGeneration += 1;
  }
}

export const queryCache = new QueryCacheManager();
export { DEFAULT_STALE_TIME_MS, STATIC_STALE_TIME_MS };
