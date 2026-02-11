import { userCache, userFollowersCache } from "../config/cache.js";
import * as twitchService from "../services/twitchService.js";
import { formatRelativeTime } from "../utils/timeFormatter.js";

export const getBulkUserStats = async (req, res) => {
    const { usernames } = req.body;

    if (!Array.isArray(usernames)) {
        return res.status(400).json({ error: "Usernames must be an array" });
    }

    try {

        const users = await twitchService.fetchTwitchUsers(usernames, req.twitchHeaders) || [];

        const userEntries = await Promise.all(users.map(async (user) => {
            try {
                const followers = await twitchService.fetchFollowerCount(user.id, req.twitchHeaders);

                return [
                    user.login,
                    {
                        followers,
                        ago: formatRelativeTime(user.created_at)
                    }
                ];
            } catch (err) {
                // Handle individual fetch errors so the whole request doesn't fail
                console.error(`Failed to fetch followers for ${user.login}:`, err.message);
                return [user.login, { followers: null , ago: formatRelativeTime(user.created_at)}];
            }
        }));

        res.json({ users: Object.fromEntries(userEntries) });
    } catch (error) {
        console.error(error.message || error)
        res.status(500).json({ error: "Internal Server Error" });
    }
};
