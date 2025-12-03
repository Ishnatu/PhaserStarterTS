import type { RateLimitResult } from '../events/types';

interface RateLimitBucket {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  'save': { maxRequests: 30, windowMs: 60000 },
  'loot': { maxRequests: 30, windowMs: 60000 },
  'combat': { maxRequests: 60, windowMs: 60000 },
  'forge': { maxRequests: 20, windowMs: 60000 },
  'movement': { maxRequests: 120, windowMs: 60000 },
  'default': { maxRequests: 60, windowMs: 60000 },
};

class FastRateLimiter {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private lastCleanup = Date.now();
  private cleanupInterval = 60000;

  check(playerId: string, endpoint: string): RateLimitResult {
    const now = Date.now();
    
    if (now - this.lastCleanup > this.cleanupInterval) {
      this.cleanup();
      this.lastCleanup = now;
    }

    const config = this.getConfig(endpoint);
    const key = `${playerId}:${endpoint}`;
    let bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetTime) {
      bucket = { count: 0, resetTime: now + config.windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count++;

    const allowed = bucket.count <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - bucket.count);

    return { allowed, remaining, resetTime: bucket.resetTime };
  }

  private getConfig(endpoint: string): RateLimitConfig {
    for (const [key, config] of Object.entries(DEFAULT_CONFIGS)) {
      if (endpoint.includes(key)) {
        return config;
      }
    }
    return DEFAULT_CONFIGS.default;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (now >= bucket.resetTime) {
        this.buckets.delete(key);
      }
    }
  }

  getStats(): { bucketCount: number } {
    return { bucketCount: this.buckets.size };
  }
}

export const rateLimiter = new FastRateLimiter();
