import axios from "axios";

const state = {
    accessToken: null,
    tokenExpiry: null,
};

export const ensureAccessToken = async (req, res, next) => {
    const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;
    if (!state.accessToken || Date.now() >= state.tokenExpiry) {
        try {
            const params = new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                client_secret: TWITCH_CLIENT_SECRET,
                grant_type: "client_credentials",
            });

            const { data } = await axios.post("https://id.twitch.tv/oauth2/token", params);
            
            state.accessToken = data.access_token;
            state.tokenExpiry = Date.now() + data.expires_in * 1000;
            console.log("✅ Twitch token refreshed");
        } catch (error) {
            console.error(error.message)
            return res.status(500).json({ error: "Failed to authenticate with Twitch" });
        }
    }

    // Attach headers to request for downstream use
    req.twitchHeaders = {
        headers: {
            "Client-ID": TWITCH_CLIENT_ID,
            Authorization: `Bearer ${state.accessToken}`,
        },
    };
    next();
};