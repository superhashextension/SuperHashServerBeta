import { Redis } from "@upstash/redis";

const redisUrl   = process.env.KV_REST_API_URL;
const redisToken = process.env.KV_REST_API_TOKEN;

if (!redisUrl) {
  const errorMsg = "CRITICAL ERROR: KV_REST_API_URL environment variable is completely missing!";
  log.fatal(errorMsg);
  process.exit(1);
}

if (!redisToken) {
  const errorMsg = "CRITICAL ERROR: UPSTASH_REDIS_REST_TOKEN environment variable is completely missing!";
  log.fatal(errorMsg);
  process.exit(1);
}

export const redis = new Redis({
  url:   redisUrl,
  token: redisToken,

  retry: (retryCount, error) => {
    if (retryCount > 5) {
      log.error(
        { err: error?.message },
        "Redis connection aborted after 5 retry attempts."
      );
      return false; // Stop retrying entirely
    }
    // Same backoff formula: 100ms, 400ms, 900ms... capped at 3s
    const delay = Math.min(retryCount * retryCount * 100, 3000);
    log.warn(`Redis retry attempt #${retryCount} — next attempt in ${delay}ms`);
    return delay;
  },
});

(async () => {
  try {
    const ping = await redis.ping();
    if (ping === "PONG") {
      log.info("Redis Engine connected successfully (Upstash REST)");
    } else {
      log.warn({ ping }, "Redis PING returned unexpected response");
    }
  } catch (err) {
    log.error(
      { err: err},
      "Redis service runtime connection anomaly detected"
    );
    // Do NOT exit here — let your app run, retries will handle it
  }
})();

export async function getRedisStatus() {
  try {
    const start = Date.now();
    const ping  = await redis.ping();
    const latencyMs = Date.now() - start;

    const isConnected = ping === "PONG";

    return {
      isConnected,
      latencyMs,
      readable: isConnected
        ? `Connected (${latencyMs}ms)`
        : "Unexpected PING response",
    };
  } catch (err) {
    return {
      isConnected: false,
      latencyMs:   null,
      readable:    `Unavailable — ${err.message}`,
    };
  }
}