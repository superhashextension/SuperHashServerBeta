import { userCache, userFollowersCache } from "../config/cache.js";
import * as twitchService from "../services/twitchService.js";
import { formatRelativeTime } from "../utils/timeFormatter.js";

export const getBulkUserStats = async (req, res) => {
    const { usernames } = req.body;

    if (!Array.isArray(usernames)) {
        return res.status(400).json({ error: "Usernames must be an array" });
    }

    try {
        // 1. Filter missing users
        const unfetched = usernames.filter(u => !userCache.has(u));

        // 2. Fetch and cache only if needed
        if (unfetched.length > 0) {
            const fetchedUsers = await twitchService.fetchTwitchUsers(unfetched, req.twitchHeaders);
            fetchedUsers.forEach(user => userCache.set(user.login, user));
        }

        // 3. Process the original username list (ensures no duplicates & preserves order)
        const userEntries = await Promise.all(usernames.map(async (username) => {
            const user = userCache.get(username);

            // Safety check if user doesn't exist in cache or Twitch API
            if (!user) return [username, null];

            try {
                const followers = await twitchService.fetchFollowerCount(user.id, req.twitchHeaders);
                return [
                    username,
                    { followers, ago: formatRelativeTime(user.created_at) }
                ];
            } catch (err) {
                console.error(`Failed to fetch followers for ${username}:`, err.message);
                return [username, { followers: null, ago: formatRelativeTime(user.created_at) }];
            }
        }));

        res.json({ users: Object.fromEntries(userEntries) });
    } catch (error) {
        console.error(error.message || error)
        res.status(500).json({ error: "Internal Server Error" });
    }
};
