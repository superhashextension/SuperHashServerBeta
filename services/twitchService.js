import axios from "axios";

const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql';
const TWITCH_API_BASE = 'https://api.twitch.tv/helix';


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

    // Index channel data by broadcaster_id for O(1) lookup
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

    console.log(users);

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

    console.log(followersData);
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
        console.log(error.message || error);
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

        // 2. Twitch returns an array of results matching your batch order
        const userData = data.map(result => ({
            id: result.data?.user?.id,
            login: result.data?.user?.login,
            followers: result.data?.user?.followers?.totalCount,
        }));
        // console.log("Batched Profiles:", profiles);
        return userData;
    } catch (error) {
        console.log(error.message || error);
        return [];
    }
};

