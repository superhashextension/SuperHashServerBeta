import axios from "axios";
import { userCache, userFollowersCache } from "../config/cache.js";


export const fetchTwitchUser = async (username, config) => {

    const cachedUser = userCache.get(username);
    if (cachedUser) return cachedUser;

    const { data } = await axios.get(`https://api.twitch.tv/helix/users?login=${username}`, config);
    const userData = data.data[0];

    if (userData) {
        userCache.set(username, userData);
    }

    return userData;
};


export const fetchTwitchUsers = async (usernames, config) => {

    // const cachedUser = userCache.get(username);
    // if (cachedUser) return cachedUser;

    const params = new URLSearchParams(usernames.map(username => ['login', username]));

    const { data } = await axios.get(`https://api.twitch.tv/helix/users?${params.toString()}`, config);
    const userData = data.data;
    // console.log(userData);

    // if (userData) {
    //     userCache.set(username, userData);
    // }

    return userData;
};

export const fetchFollowerCount = async (broadcasterId, config) => {

    const cachedFollowersCount = userFollowersCache.get(broadcasterId);
    if (cachedFollowersCount !== undefined) return cachedFollowersCount;

    const { data } = await axios.get(
        `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}`,
        config
    );

    userFollowersCache.set(broadcasterId, data.total);
    return data.total;
};
