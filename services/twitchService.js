import axios from "axios";

const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
const TWITCH_API_BASE = 'https://api.twitch.tv/helix';

// ── Pre-compiled Regex ──
const TWITCH_INFO_REGEX = /#EXT-X-TWITCH-INFO:(.*)/;
const ORIGIN_REGEX = /ORIGIN="([^"]+)"/;
const CLUSTER_REGEX = /CLUSTER="([^"]+)"/;
const USER_COUNTRY_REGEX = /USER-COUNTRY="([^"]+)"/;
const USER_IP_REGEX = /USER-IP="([^"]+)"/;
const BROADCAST_ID_REGEX = /BROADCAST-ID="([^"]+)"/;
const STREAM_TIME_REGEX = /STREAM-TIME="([^"]+)"/;
const REGION_CODE_REGEX = /^([a-z]+)\d+$/i;
const CLUSTER_REGION_REGEX = /prod_([a-z]+)\d+/i;

const buildTokenPayload = (username) =>
    `{"query":"{streamPlaybackAccessToken(channelName:\\"${username}\\",params:{platform:\\"web\\",playerBackend:\\"mediaplayer\\",playerType:\\"site\\"}){value signature}}"}`;

const REGIONS = Object.freeze({
    use: "US East",
    usw: "US West",
    usc: "US Central",
    euw: "Europe West",
    euc: "Europe Central",
    eun: "Europe North",
    eus: "Europe South",
    eu: "Europe",
    apn: "Asia Pacific North (Japan/Korea)",
    aps: "Asia Pacific South (India/SEA)",
    ape: "Asia Pacific East",
    sae: "South America East (Brazil)",
    saw: "South America West",
    sa: "South America",
    oce: "Oceania (Australia/NZ)",
    me: "Middle East",
    af: "Africa",
    jpa: "Japan",
});

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_CONCURRENCY = 10;
const inflightRequests = new Map();

// ═══════════════════════════════════════════════
// EXISTING SERVICES
// ═══════════════════════════════════════════════

export const fetchTwitchUsers = async (broadcasters, config) => {

    const params = {
        id: new URLSearchParams(broadcasters.map(({ id }) => ['id', id])),
        login: new URLSearchParams(broadcasters.map(({ login }) => ['login', login])),
        broadcaster_id: new URLSearchParams(broadcasters.map(({ id }) => ['broadcaster_id', id])),
    }

    const [{ data: { data: userData } }, { data: { data: channelData } }] = await Promise.all([
        axios.get(`${TWITCH_API_BASE}/users?${params.id.toString()}`, config),
        axios.get(`${TWITCH_API_BASE}/channels?${params.broadcaster_id.toString()}`, config),
    ])

    const channelMap = new Map(channelData.map(ch => [ch.broadcaster_id, ch]));

    const users = userData.map(user => {
        const channel = channelMap.get(user.id);
        return {
            id: user.id,
            login: user.login,
            createdAt: user.created_at,
            language: channel?.broadcaster_language || null,
        };
    });

    // console.log(users);
    return users;
};

export const fetchFollowerCount = async (broadcasters, config) => {

    const followersData = await Promise.all(
        broadcasters.map(async ({ id, login }) => {
            const { data: { total: followersCount } } = await axios.get(
                `${TWITCH_API_BASE}/channels/followers?broadcaster_id=${id}`, config
            );

            return {
                id,
                login,
                followers: followersCount,
            };
        })
    );

    return followersData;
};

export const fetchTwitchUsersGQL = async (broadcasters, config) => {

    try {
        const batchBody = broadcasters.map(({ login }) => ({
            operationName: "GetChannelProfile",
            variables: { login: login.toLowerCase() },
            query: `
            query GetChannelProfile($login: String!) {
                user(login: $login) {
                    id
                    login
                    createdAt
                    followers { totalCount }
                    broadcastSettings { language }
                }
            }
        `
        }));

        const { data } = await axios.post(TWITCH_GQL_URL, batchBody, config);
        const userData = data.map(result => ({
            id: result.data?.user?.id,
            login: result.data?.user?.login,
            createdAt: result.data?.user?.createdAt,
            followers: result.data?.user?.followers?.totalCount,
            language: result.data?.user?.broadcastSettings?.language
        }));
        return userData;
    } catch (error) {
        console.error('[fetchTwitchUsersGQL] : ', error.message || error);
        return [];
    }
};

export const fetchFollowerCountGQL = async (broadcasters, config) => {

    try {
        const batchBody = broadcasters.map(({ login }) => ({
            operationName: "GetChannelProfile",
            variables: { login: login.toLowerCase() },
            query: `
            query GetChannelProfile($login: String!) {
                user(login: $login) {
                    id
                    login
                    followers { totalCount }
                }
            }
        `
        }));

        const { data } = await axios.post(TWITCH_GQL_URL, batchBody, config);

        const userData = data.map(result => ({
            id: result.data?.user?.id,
            login: result.data?.user?.login,
            followers: result.data?.user?.followers?.totalCount,
        }));
        return userData;
    } catch (error) {
        console.error('[fetchFollowerCountGQL] : ', error.message || error);
        return [];
    }
};

// ═══════════════════════════════════════════════
// SERVER LOCATION — INTERNAL HELPERS
// ═══════════════════════════════════════════════

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
            keepalive: true,
        });
    } finally {
        clearTimeout(timeout);
    }
}

function parsePlaylistFast(text) {
    const infoMatch = text.match(TWITCH_INFO_REGEX);
    if (!infoMatch) return null;

    const infoLine = infoMatch[1];

    const origin = infoLine.match(ORIGIN_REGEX)?.[1] || null;
    const cluster = infoLine.match(CLUSTER_REGEX)?.[1] || null;
    const userCountry = infoLine.match(USER_COUNTRY_REGEX)?.[1] || null;
    const userIp = infoLine.match(USER_IP_REGEX)?.[1] || null;
    const broadcastId = infoLine.match(BROADCAST_ID_REGEX)?.[1] || null;
    const streamTime = infoLine.match(STREAM_TIME_REGEX)?.[1] || null;

    let regionCode = null;
    let region = null;

    if (origin) {
        const originMatch = origin.match(REGION_CODE_REGEX);
        if (originMatch) {
            regionCode = originMatch[1].toLowerCase();
            region = REGIONS[regionCode] || `Unknown (${regionCode})`;
        }
    }

    if (!regionCode && cluster) {
        const clusterMatch = cluster.match(CLUSTER_REGION_REGEX);
        if (clusterMatch) {
            regionCode = clusterMatch[1].toLowerCase();
            region = REGIONS[regionCode] || `Unknown (${regionCode})`;
        }
    }

    let cdn = null;
    if (cluster) {
        if (cluster.startsWith("cloudfront")) cdn = "CloudFront";
        else if (cluster.startsWith("fastly")) cdn = "Fastly";
        else if (cluster.startsWith("akamai")) cdn = "Akamai";
    }

    let confidence = "low";
    if (origin && cluster) {
        const clusterMatch = cluster.match(CLUSTER_REGION_REGEX);
        if (clusterMatch && clusterMatch[1].toLowerCase() === regionCode) {
            confidence = "high";
        } else {
            confidence = "medium";
        }
    } else if (origin || cluster) {
        confidence = "medium";
    }

    return {
        viewer: { country: userCountry, ip: userIp },
        broadcaster: {
            region,
            regionCode,
            origin,
            cluster,
            cdn,
            confidence,
        },
        stream: {
            broadcastId,
            streamTime: streamTime ? parseFloat(streamTime) : null,
        },
    };
}

async function fetchSingleServer(broadcaster, headers) {
    const { id, login } = broadcaster;

    try {
        const tokenResponse = await fetchWithTimeout(TWITCH_GQL_URL, {
            method: "POST",
            headers,
            body: buildTokenPayload(login),
        });

        const tokenData = await tokenResponse.json();
        const token = tokenData?.data?.streamPlaybackAccessToken;

        if (!token) {
            return { id, login, error: "Stream offline" };
        }

        const playlistUrl =
            `https://usher.ttvnw.net/api/channel/hls/${login}.m3u8` +
            `?token=${encodeURIComponent(token.value)}` +
            `&sig=${token.signature}` +
            `&allow_source=true` +
            `&fast_bread=true`;

        const playlistResponse = await fetchWithTimeout(playlistUrl);
        const playlistText = await playlistResponse.text();

        const parsed = parsePlaylistFast(playlistText);

        if (!parsed) {
            return { id, login, error: "Parse failed" };
        }

        return { id, login, ...parsed };
    } catch (error) {
        if (error.name === "AbortError") {
            return { id, login, error: "Timeout" };
        }
        return { id, login, error: error.message };
    }
}

async function getServerCached(broadcaster, headers, cache) {
    const key = broadcaster.login.toLowerCase();

    // 1. Check cache
    const cached = cache.get(key);
    if (cached) return { ...cached, _cached: true };

    // 2. Deduplicate in-flight
    if (inflightRequests.has(key)) {
        return inflightRequests.get(key);
    }

    // 3. Fetch and store for dedup
    const promise = fetchSingleServer(broadcaster, headers);
    inflightRequests.set(key, promise);

    try {
        const result = await promise;
        if (!result.error) {
            cache.set(key, result);
        }
        return result;
    } finally {
        inflightRequests.delete(key);
    }
}

// ═══════════════════════════════════════════════
// SERVER LOCATION — PUBLIC API
// ═══════════════════════════════════════════════

/**
 * Fetch server/location info for an array of broadcasters.
 *
 * @param {Array<{id: string, login: string}>} broadcasters
 * @param {Object} config - { headers: { "Client-ID", "Authorization", ... } }
 * @param {LRUCache} cache - userServerCache instance from cache.js
 * @param {Object} [options]
 * @param {number} [options.concurrency=10]
 * @returns {Promise<Array>}
 *
 * @example
 * import { userServerCache } from "./cache.js";
 *
 * const config = {
 *     headers: {
 *         "Client-ID": PUBLIC_CLIENT_ID,
 *         "Authorization": `OAuth ${authToken}`,
 *         "accept-encoding": "gzip, deflate, br, zstd"
 *     },
 * };
 *
 * const results = await fetchBroadcasterServer(broadcasters, config, userServerCache);
 */
export const fetchBroadcasterServer = async (broadcasters, config, cache, { concurrency = DEFAULT_CONCURRENCY } = {}) => {
    const headers = {
        "Client-ID": config.headers["Client-ID"],
        "Content-Type": "application/json",
    };

    if (config.headers["Authorization"]) {
        headers["Authorization"] = config.headers["Authorization"];
    }

    const results = [];

    for (let i = 0; i < broadcasters.length; i += concurrency) {
        const chunk = broadcasters.slice(i, i + concurrency);

        const chunkResults = await Promise.allSettled(
            chunk.map((b) => getServerCached(b, headers, cache))
        );

        chunkResults.forEach((settled, idx) => {
            if (settled.status === "fulfilled") {
                results.push(settled.value);
            } else {
                results.push({
                    id: chunk[idx].id,
                    login: chunk[idx].login,
                    error: settled.reason?.message || "Failed",
                });
            }
        });
    }

    return results;
};