import { LRUCache } from "lru-cache/raw";

const MAX_CHACHE_SIZE = 2000;

export const userCache = new LRUCache({
    // 1. The Capacity
    max: MAX_CHACHE_SIZE,

    // 2. The Expiration (Time-To-Live)
    ttl: 1000 * 60 * 60 * 24, // 1 day

    // 3. Maintenance Settings
    ttlAutopurge: true,    // Automatically deletes expired items in the background
    updateAgeOnGet: true,  // If you 'get' an item, its TTL resets (sliding expiration)

    // 4. Performance & Memory
    allowStale: false,     // If true, returns the expired value before deleting it
    updateAgeOnHas: false, // Don't reset age just by checking if the key exists
});

export const userFollowersCache = new LRUCache({
    max: MAX_CHACHE_SIZE,
    ttl: 1000 * 60 * 5, // 5 minutes
    ttlAutopurge: true,
    updateAgeOnGet: false,
    allowStale: false,
    updateAgeOnHas: false,
});