import { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

function readClientIp(req: Request): string {
  const raw = req.ip || req.socket.remoteAddress || "unknown";
  return raw.replace(/^::ffff:/, "");
}

export function createRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  let lastCleanupAt = Date.now();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const keyRaw = options.keyGenerator ? options.keyGenerator(req) : readClientIp(req);
    const key = keyRaw.trim() || "unknown";

    if (buckets.size > 10_000 || now - lastCleanupAt > options.windowMs) {
      for (const [bucketKey, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) {
          buckets.delete(bucketKey);
        }
      }
      lastCleanupAt = now;
    }

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        message:
          options.message ??
          "Too many requests. Please wait and try again.",
      });
      return;
    }

    existing.count += 1;
    buckets.set(key, existing);
    next();
  };
}
