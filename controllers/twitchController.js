import { userCache, userFollowersCache } from "../config/cache.js";
import * as twitchService from "../services/twitchService.js";
import { formatRelativeTime } from "../utils/timeFormatter.js";

export const getBulkUserStats = async (req, res) => {
    const { usernames } = req.body;

    if (!Array.isArray(usernames)) {
        return res.status(400).json({ error: "Usernames must be an array" });
    }

    try {
        const users = await twitchService.fetchTwitchUsers(usernames, req.twitchHeaders);

        const results = await Promise.all(usernames.map(async (username) => {
            const user = users.find((user) => user.login === username);
            const followers = await twitchService.fetchFollowerCount(user.id, req.twitchHeaders);
            return [username, { followers, ago: formatRelativeTime(user.created_at) }]
        }))

        const response = Object.fromEntries(results);
        res.json({ users: response });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};
