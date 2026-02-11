import {userCache, userFollowersCache } from "../config/cache.js";
import * as twitchService from "../services/twitchService.js";
import { formatRelativeTime } from "../utils/timeFormatter.js";

export const getBulkUserStats = async (req, res) => {
    const { usernames } = req.body;

    if (!Array.isArray(usernames)) {
        return res.status(400).json({ error: "Usernames must be an array" });
    }

    try {
        const results = await Promise.all(
            usernames.map(async (username) => {
                try {
                    const user = await twitchService.fetchTwitchUser(username, req.twitchHeaders);
                    if (!user) return { username, error: "Not found" };

                    const followers = await twitchService.fetchFollowerCount(user.id, req.twitchHeaders);

                    return [
                        username,
                        { followers, ago: formatRelativeTime(user.created_at) },
                    ];
                } catch (err) {
                    console.error(err.message);
                    return [username, {error: "API Error"}];
                }
            })
        );

        const response = Object.fromEntries(results);

        // const response = results.reduce((acc, curr) => {
        //     acc[curr.username] = curr.error ? { error: curr.error } : curr;
        //     return acc;
        // }, {});

        res.json({ users: response });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};
