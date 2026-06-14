import { getDatabaseStatus } from "../../config/db.js";
import { getRedisStatus }    from "../../config/redis.js";   // ✅ new import

export async function getHealthStatus(req, res) {

  // Run both checks in parallel — don't wait for one before the other
  const [dbCheck, redisCheck] = await Promise.allSettled([
    getDatabaseStatus(),    // your existing DB check
    getRedisStatus(),       // ✅ new Redis check
  ]);

  // Safely unwrap Promise.allSettled results
  const db    = dbCheck.status    === "fulfilled" ? dbCheck.value    : { isConnected: false, readable: "Check failed" };
  const cache = redisCheck.status === "fulfilled" ? redisCheck.value : { isConnected: false, readable: "Check failed", latencyMs: null };

  // ── Overall Status Logic ──────────────────────────────────────
  // UP        = all critical services healthy
  // DEGRADED  = app works but a non-critical service is down
  // DOWN      = core/critical service (DB) is down
  const overallStatus =
    !db.isConnected                       ? "DOWN"     :   // DB is critical
    db.isConnected && !cache.isConnected  ? "DEGRADED" :   // Redis down but DB up
                                            "UP";          // Everything healthy

  const healthCheck = {
    status:    overallStatus,
    timestamp: new Date().toISOString(),
    uptime:    `${process.uptime().toFixed(2)}s`,
    services: {
      server:   "OK",
      database: db.readable,
      cache: {
        status:    cache.isConnected ? "OK" : "UNAVAILABLE",
        message:   cache.readable,
        latencyMs: cache.latencyMs,   // e.g. "Connected (12ms)"
      },
    },
  };

  // 200 = UP | 207 = DEGRADED (partial content) | 503 = DOWN
  const statusCode =
    overallStatus === "UP"       ? 200 :
    overallStatus === "DEGRADED" ? 207 :
                                   503;

  return res.status(statusCode).json(healthCheck);
}