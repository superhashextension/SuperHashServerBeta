import { userCache, userFollowersCache } from "../config/cache.js";
import * as twitchService from "../services/twitchService.js";

// export const getUserStats = async (req, res) => {
//     const { broadcasters } = req.body;

//     if (!Array.isArray(broadcasters)) {
//         return res.status(400).json({ error: "Broadcasters must be an array" });
//     }

//     if (broadcasters.length > 35) {
//         return res.status(400).json({ error: "Too many broadcasters" });
//     }

//     try {
//         const usersData = new Map();
//         const followersData = new Map();
//         const unfetchedUsers = [];
//         const unfetchedFollowers = [];

//         broadcasters.forEach((broadcaster) => {
//             const { id, login } = broadcaster;

//             const user = userCache.get(login);
//             const followers = userFollowersCache.get(login);

//             if (user) {
//                 usersData.set(login, user);
//             } else {
//                 unfetchedUsers.push(broadcaster);
//             }

//             if (followers) {
//                 followersData.set(login, followers);
//             } else if (user) {
//                 // User is cached but followers aren't
//                 unfetchedFollowers.push(broadcaster);
//             }
//             // If neither user nor followers are cached,
//             // fetchTwitchUsersGQL will return both
//         });

//         // Run both fetches in parallel
//         const [fetchedUsers, fetchedFollowersList] = await Promise.all([
//             unfetchedUsers.length > 0
//                 ? twitchService.fetchTwitchUsersGQL(unfetchedUsers, req.twitchGQLHeaders)
//                 : [],
//             unfetchedFollowers.length > 0
//                 ? twitchService.fetchFollowerCountGQL(unfetchedFollowers, req.twitchGQLHeaders)
//                 : [],
//         ]);

//         const [fetchedUsers, fetchedFollowersList] = await Promise.all([
//             unfetchedUsers.length > 0
//                 ? twitchService.fetchTwitchUsers(broadcasters, req.twitchHeaders)
//                 : [],
//             unfetchedFollowers.length > 0
//                 ? twitchService.fetchFollowerCount(broadcasters, req.twitchHeaders)
//                 : [],
//         ]);

//         fetchedUsers.forEach((user) => {
//             const { login, followers } = user;
//             usersData.set(login, user);
//             userCache.set(login, user);
//             followersData.set(login, followers);
//             userFollowersCache.set(login, followers);
//         });

//         fetchedFollowersList.forEach(({ login, followers }) => {
//             followersData.set(login, followers);
//             userFollowersCache.set(login, followers);
//         });

//         const userEntries = broadcasters.map(({ login }) => {
//             const user = usersData.get(login);
//             const followers = followersData.get(login);
//             return { ...user, followers };
//         });

//         res.json({ users: userEntries });
//     } catch (error) {
//         console.error(error.message || error)
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// };

export const getUserStats = async (req, res) => {
    const { broadcasters } = req.body;

    if (!Array.isArray(broadcasters)) {
        return res.status(400).json({ error: "Broadcasters must be an array" });
    }

    if (broadcasters.length > 35) {
        return res.status(400).json({ error: "Too many broadcasters" });
    }

    try {
        const usersData = new Map();
        const followersData = new Map();
        const unfetchedUsers = [];
        const unfetchedFollowers = [];

        broadcasters.forEach((broadcaster) => {
            const { login } = broadcaster;

            const user = userCache.get(login);
            const followers = userFollowersCache.get(login);

            if (user) {
                usersData.set(login, user);
            } else {
                unfetchedUsers.push(broadcaster);
            }

            if (followers !== undefined) {
                followersData.set(login, followers);
            } else if (user) {
                // User cached but followers aren't
                unfetchedFollowers.push(broadcaster);
            }
            // If neither cached → unfetchedUsers handles both (GQL returns followers)
        });

        // ─── Try GQL first, fall back to Official API ───────
        try {
            const [fetchedUsers, fetchedFollowersList] = await Promise.all([
                unfetchedUsers.length > 0
                    ? twitchService.fetchTwitchUsersGQL(unfetchedUsers, req.twitchGQLHeaders)
                    : [],
                unfetchedFollowers.length > 0
                    ? twitchService.fetchFollowerCountGQL(unfetchedFollowers, req.twitchGQLHeaders)
                    : [],
            ]);

            // GQL returns user data + followers together
            fetchedUsers.forEach((user) => {
                const { login, followers } = user;
                usersData.set(login, user);
                userCache.set(login, user);
                followersData.set(login, followers);
                userFollowersCache.set(login, followers);
            });

            fetchedFollowersList.forEach(({ login, followers }) => {
                followersData.set(login, followers);
                userFollowersCache.set(login, followers);
            });

        } catch (gqlError) {
            console.warn("GQL failed, falling back to Official API:", gqlError.message);

            // Official API doesn't return followers → fetch them separately
            const needFollowers = [...unfetchedUsers, ...unfetchedFollowers];

            const [fetchedUsers, fetchedFollowersList] = await Promise.all([
                unfetchedUsers.length > 0
                    ? twitchService.fetchTwitchUsers(unfetchedUsers, req.twitchHeaders)
                    : [],
                needFollowers.length > 0
                    ? twitchService.fetchFollowerCount(needFollowers, req.twitchHeaders)
                    : [],
            ]);

            fetchedUsers.forEach((user) => {
                usersData.set(user.login, user);
                userCache.set(user.login, user);
            });

            fetchedFollowersList.forEach(({ login, followers }) => {
                followersData.set(login, followers);
                userFollowersCache.set(login, followers);
            });
        }

        // ─── Merge and respond ──────────────────────────────
        const userEntries = broadcasters.map(({ login }) => {
            const user = usersData.get(login);
            const followers = followersData.get(login); 
            return { ...user, followers };
        });

        res.json({ users: userEntries });
    } catch (error) {
        console.error(error.message || error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};