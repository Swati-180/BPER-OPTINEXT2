/**
 * Centralized Client-Side Query Cache for BPER-OPTINEXT2
 *
 * Implements:
 * 1. Monotonic invalidation generation tracking to prevent in-flight race conditions
 * 2. Truly targeted invalidation by endpoint/pattern without purging unrelated entries
 * 3. Prevention of new callers joining invalidated in-flight requests
 * 4. Identity-safe in-flight cleanup to prevent older requests from unregistering newer promises
 * 5. Deterministic RegExp matching by stripping/resetting stateful flags ('g', 'y')
 * 6. Bounded, deduplicated invalidation rules to prevent memory growth
 * 7. Scope isolation (scoped by user email, role, reporting period, filters)
 * 8. Automatic cache invalidation on mutations or logout
 * 9. Configurable staleTime and TTL expiration
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

interface InFlightEntry<T> {
  promise: Promise<T>;
  generation: number;
}

export interface QueryCacheOptions {
  staleTime?: number; // Time in ms before background revalidation is needed (default: 60s)
  forceRefresh?: boolean; // Bypass cache and fetch fresh
}

interface InvalidationRule {
  pattern: RegExp | string;
  generation: number;
}

const DEFAULT_STALE_TIME_MS = 60_000; // 60 seconds for analytics/operational data
const STATIC_STALE_TIME_MS = 5 * 60_000; // 5 minutes for reference data (taxonomy, assumptions)

export class QueryCacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, InFlightEntry<any>>();
  // History of targeted invalidation rules, deduplicated by pattern identity
  private invalidations: InvalidationRule[] = [];
  private baseEpoch = 1;

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
   * Helper to test if an endpoint matches a string or regex pattern.
   * Strips stateful regex flags ('g', 'y') to guarantee deterministic matching.
   */
  public matchesPattern(endpoint: string, pattern: RegExp | string): boolean {
    if (typeof pattern === 'string') {
      return endpoint.includes(pattern);
    }
    if (pattern instanceof RegExp) {
      if (pattern.global || pattern.sticky) {
        const cleanFlags = pattern.flags.replace(/[gy]/g, '');
        return new RegExp(pattern.source, cleanFlags).test(endpoint);
      }
      return pattern.test(endpoint);
    }
    return false;
  }

  /**
   * Returns current monotonic generation for an endpoint based strictly on matching invalidations.
   * Unrelated endpoints are NOT affected when other endpoints are invalidated.
   */
  public getGeneration(endpoint: string): number {
    let gen = this.baseEpoch;
    for (const rule of this.invalidations) {
      if (this.matchesPattern(endpoint, rule.pattern)) {
        gen += rule.generation;
      }
    }
    return gen;
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
    const currentGen = this.getGeneration(endpoint);

    // 1. Check cache if not forcing refresh
    if (!forceRefresh) {
      const cached = this.get<T>(endpoint);
      if (cached !== null) {
        return cached;
      }
    }

    // 2. Check in-flight promise: only join if it was started in the CURRENT generation
    const existingInFlight = this.inFlight.get(key);
    if (existingInFlight && existingInFlight.generation === currentGen) {
      return existingInFlight.promise as Promise<T>;
    }

    // Capture generation at request start
    const requestGen = currentGen;

    // 3. Initiate request and track promise with generation identity
    let inFlightEntry: InFlightEntry<T>;
    const promise = (async () => {
      try {
        const data = await fetcher();
        if (data !== null && data !== undefined) {
          // Only cache if generation still matches when resolved
          this.set(endpoint, data, staleTime, requestGen);
        }
        return data;
      } finally {
        // Identity-safe cleanup: only delete if inFlight still points to THIS exact promise entry
        const currentEntry = this.inFlight.get(key);
        if (currentEntry === inFlightEntry) {
          this.inFlight.delete(key);
        }
      }
    })();

    inFlightEntry = { promise, generation: requestGen };
    this.inFlight.set(key, inFlightEntry);
    return promise;
  }

  /**
   * Invalidate cache matching an endpoint prefix or regex pattern.
   * Increments the generation specifically for matching endpoints so in-flight calls are discarded,
   * while leaving unrelated cached entries intact.
   * Deduplicates pattern rules to prevent unbounded memory growth.
   */
  public invalidateMatching(pattern: RegExp | string): void {
    // 1. Evict any matching cached entries
    for (const [key] of this.cache.entries()) {
      // Key format: email::role::endpoint
      const parts = key.split('::');
      const endpoint = parts.slice(2).join('::');
      if (this.matchesPattern(endpoint, pattern)) {
        this.cache.delete(key);
      }
    }

    // 2. Deduplicate invalidation rule to prevent unbounded array growth
    const patternKey = typeof pattern === 'string' ? pattern : pattern.toString();
    const existingRule = this.invalidations.find(rule => {
      const k = typeof rule.pattern === 'string' ? rule.pattern : rule.pattern.toString();
      return k === patternKey;
    });

    if (existingRule) {
      existingRule.generation += 1;
    } else {
      this.invalidations.push({
        pattern,
        generation: 1
      });
    }
  }

  /**
   * Purge the entire cache and increment base epoch.
   */
  public clearAll(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.invalidations = [];
    this.baseEpoch += 1;
  }
}

export const queryCache = new QueryCacheManager();
export { DEFAULT_STALE_TIME_MS, STATIC_STALE_TIME_MS };
