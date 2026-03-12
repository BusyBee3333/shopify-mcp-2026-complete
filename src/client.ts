// Shopify Admin API Client
// Handles auth, timeouts, circuit breaker, retry, rate limiting, and cursor-based pagination

import { logger } from "./logger.js";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;
const DEFAULT_TIMEOUT_MS = 30_000;

// ============================================
// CIRCUIT BREAKER
// ============================================
type CircuitState = "closed" | "open" | "half-open";

class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenLock = false;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(failureThreshold = 5, resetTimeoutMs = 60_000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }

  canExecute(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        if (!this.halfOpenLock) {
          this.halfOpenLock = true;
          this.state = "half-open";
          logger.info("circuit_breaker.half_open");
          return true;
        }
        return false;
      }
      return false;
    }
    return false;
  }

  recordSuccess(): void {
    this.halfOpenLock = false;
    if (this.state !== "closed") {
      logger.info("circuit_breaker.closed", { previousFailures: this.failureCount });
    }
    this.failureCount = 0;
    this.state = "closed";
  }

  recordFailure(): void {
    this.halfOpenLock = false;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold || this.state === "half-open") {
      this.state = "open";
      logger.warn("circuit_breaker.open", {
        failureCount: this.failureCount,
        resetAfterMs: this.resetTimeoutMs,
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// ============================================
// SHOPIFY API CLIENT
// ============================================
export class ShopifyClient {
  private storeDomain: string;
  private accessToken: string;
  private baseUrl: string;
  private circuitBreaker: CircuitBreaker;
  private timeoutMs: number;
  private rateLimitBucket: number = 40; // Shopify: 40 req/sec leaky bucket
  private lastRequestTime: number = 0;

  constructor(storeDomain: string, accessToken: string, timeoutMs?: number) {
    this.storeDomain = storeDomain;
    this.accessToken = accessToken;
    this.baseUrl = `https://${storeDomain}/admin/api/${API_VERSION}`;
    this.timeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;
    this.circuitBreaker = new CircuitBreaker();
  }

  // === Core request with timeout + circuit breaker + retry ===
  async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {},
    fullUrl?: string
  ): Promise<{ data: T; linkHeader?: string }> {
    if (!this.circuitBreaker.canExecute()) {
      throw new Error("Circuit breaker is open — Shopify API unavailable. Retry in 60 seconds.");
    }

    await this.throttle();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const url = fullUrl || `${this.baseUrl}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
        const requestId = logger.requestId();
        const start = performance.now();

        logger.debug("api_request.start", {
          requestId,
          method: options.method || "GET",
          endpoint,
          attempt: attempt + 1,
        });

        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
              "X-Shopify-Access-Token": this.accessToken,
              "Content-Type": "application/json",
              "Accept": "application/json",
              ...options.headers,
            },
          });

          const durationMs = Math.round(performance.now() - start);

          // Update rate limit bucket from response
          const callLimit = response.headers.get("X-Shopify-Shop-Api-Call-Limit");
          if (callLimit) {
            const [used, max] = callLimit.split("/").map(Number);
            this.rateLimitBucket = (max || 40) - (used || 0);
            if (this.rateLimitBucket < 5) {
              logger.warn("rate_limit.low_bucket", { bucket: this.rateLimitBucket });
            }
          }

          // Rate limit: slow down if bucket is low
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get("Retry-After") || "2", 10);
            logger.warn("api_request.rate_limited", { requestId, retryAfter, endpoint });
            await this.delay(retryAfter * 1000);
            continue;
          }

          if (response.status >= 500) {
            this.circuitBreaker.recordFailure();
            lastError = new Error(`Server error: ${response.status} ${response.statusText}`);
            logger.warn("api_request.server_error", {
              requestId, durationMs, status: response.status, endpoint, attempt: attempt + 1,
            });
            const baseDelay = RETRY_BASE_DELAY * Math.pow(2, attempt);
            await this.delay(baseDelay + Math.random() * baseDelay * 0.5);
            continue;
          }

          if (!response.ok) {
            const errorBody = await response.text();
            logger.error("api_request.client_error", {
              requestId, durationMs, status: response.status, endpoint, body: errorBody.slice(0, 500),
            });
            throw new Error(`Shopify API error ${response.status}: ${response.statusText} — ${errorBody}`);
          }

          this.circuitBreaker.recordSuccess();
          logger.debug("api_request.done", { requestId, durationMs, status: response.status, endpoint });

          if (response.status === 204) {
            return { data: { success: true } as T };
          }

          const linkHeader = response.headers.get("Link") || undefined;
          const data = await response.json() as T;
          return { data, linkHeader };
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          this.circuitBreaker.recordFailure();
          lastError = new Error(`Request timeout after ${this.timeoutMs}ms: ${endpoint}`);
          logger.error("api_request.timeout", { endpoint, timeoutMs: this.timeoutMs });
          continue;
        }
        if (error instanceof Error && !error.message.includes("Server error")) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  // === Shopify cursor pagination via Link header ===
  // Shopify uses: Link: <https://...?page_info=xxx>; rel="next"
  async paginatedGet<T>(
    endpoint: string,
    params: Record<string, string> = {},
    limit: number = 50
  ): Promise<{ data: T[]; nextPageInfo?: string }> {
    const queryParams = new URLSearchParams({
      limit: String(Math.min(limit, 250)),
      ...params,
    });

    const { data, linkHeader } = await this.request<Record<string, T[]>>(
      `${endpoint}?${queryParams}`
    );

    // Extract the resource array (e.g., data.products, data.orders)
    const resourceKey = Object.keys(data as Record<string, unknown>)[0];
    const items = (data as Record<string, T[]>)[resourceKey] || [];

    // Parse Link header for next page cursor
    let nextPageInfo: string | undefined;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      if (nextMatch) {
        nextPageInfo = nextMatch[1];
      }
    }

    return { data: items, nextPageInfo };
  }

  // Paginate using a known page_info cursor
  async paginateFromCursor<T>(
    endpoint: string,
    pageInfo: string,
    limit: number = 50
  ): Promise<{ data: T[]; nextPageInfo?: string }> {
    const queryParams = new URLSearchParams({
      limit: String(Math.min(limit, 250)),
      page_info: pageInfo,
    });

    const { data, linkHeader } = await this.request<Record<string, T[]>>(
      `${endpoint}?${queryParams}`
    );

    const resourceKey = Object.keys(data as Record<string, unknown>)[0];
    const items = (data as Record<string, T[]>)[resourceKey] || [];

    let nextPageInfo: string | undefined;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      if (nextMatch) {
        nextPageInfo = nextMatch[1];
      }
    }

    return { data: items, nextPageInfo };
  }

  // === Convenience methods ===
  async get<T>(endpoint: string): Promise<T> {
    const { data } = await this.request<T>(endpoint);
    return data;
  }

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    const { data } = await this.request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return data;
  }

  async put<T>(endpoint: string, body: unknown): Promise<T> {
    const { data } = await this.request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return data;
  }

  async patch<T>(endpoint: string, body: unknown): Promise<T> {
    const { data } = await this.request<T>(endpoint, {
      method: "PUT", // Shopify uses PUT for updates, not PATCH
      body: JSON.stringify(body),
    });
    return data;
  }

  async delete<T>(endpoint: string): Promise<T> {
    const { data } = await this.request<T>(endpoint, { method: "DELETE" });
    return data;
  }

  // === Health check ===
  async healthCheck(): Promise<{
    reachable: boolean;
    authenticated: boolean;
    latencyMs: number;
    shopName?: string;
    plan?: string;
    error?: string;
  }> {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(`${this.baseUrl}/shop.json`, {
          signal: controller.signal,
          headers: {
            "X-Shopify-Access-Token": this.accessToken,
            "Accept": "application/json",
          },
        });
        const latencyMs = Math.round(performance.now() - start);
        if (response.ok) {
          const body = await response.json() as { shop?: { name?: string; plan_name?: string } };
          return {
            reachable: true,
            authenticated: true,
            latencyMs,
            shopName: body.shop?.name,
            plan: body.shop?.plan_name,
          };
        }
        return {
          reachable: true,
          authenticated: response.status !== 401 && response.status !== 403,
          latencyMs,
          error: `Status ${response.status}`,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      return {
        reachable: false,
        authenticated: false,
        latencyMs: Math.round(performance.now() - start),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // === Throttle: avoid hitting rate limits ===
  private async throttle(): Promise<void> {
    if (this.rateLimitBucket < 5) {
      const waitMs = 500;
      logger.warn("rate_limit.throttling", { waitMs, bucket: this.rateLimitBucket });
      await this.delay(waitMs);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
