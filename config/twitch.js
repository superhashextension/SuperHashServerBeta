// config/twitch.js
import axios from "axios";
import User from "../models/User.js";

/**
 * Exchange OAuth code for tokens
 */
export async function exchangeTwitchCode(code, redirectUri) {
    const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;

    const params = new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
    });

    const { data } = await axios.post('https://id.twitch.tv/oauth2/token', params);

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in
    };
}

/**
 * Refresh Twitch user token
 */
export async function refreshTwitchUserToken(refreshToken) {
    const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;

    const params = new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
    });

    const { data } = await axios.post('https://id.twitch.tv/oauth2/token', params);

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000)
    };
}

/**
 * Get Twitch user info
 */
export async function getTwitchUser(accessToken) {
    const { TWITCH_CLIENT_ID } = process.env;

    const { data } = await axios.get('https://api.twitch.tv/helix/users', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': TWITCH_CLIENT_ID
        }
    });

    // data.data is an array - make sure it has items
    if (!data?.data?.length) {
        throw new Error('No user data returned from Twitch');
    }

    const user = data.data[0];
    return user;
}

/**
 * Revoke Twitch token
 */
export async function revokeTwitchToken(token) {
    const { TWITCH_CLIENT_ID } = process.env;

    try {
        await axios.post('https://id.twitch.tv/oauth2/revoke',
            new URLSearchParams({
                client_id: TWITCH_CLIENT_ID,
                token
            })
        );
    } catch {
        // Ignore revoke errors
    }
}

/**
 * Build Twitch auth URL
 */
export function buildAuthUrl(redirectUri, state) {
    const { TWITCH_CLIENT_ID } = process.env;
    const scopes = ['user:read:email'].join(' ');

    const params = new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes,
        state,
        force_verify: 'false'
    });

    return `https://id.twitch.tv/oauth2/authorize?${params}`;
}

/**
 * Middleware: Authenticate user via app token + cookie token
 * 
 * Headers expected:
 *   x-app-token    → Our OAuth token (identifies user in DB)
 *   x-twitch-cookie → Browser cookie token (required for GQL APIs)
 */
export const ensureUserAuth = async (req, res, next) => {
    const appToken = req.headers["x-app-token"];
    const cookieToken = req.headers["x-twitch-cookie"];

    if (!appToken) {
        return res.status(401).json({
            error: "Missing app token - please login",
            code: "NO_APP_TOKEN"
        });
    }

    if (!cookieToken) {
        return res.status(401).json({
            error: "Missing Twitch cookie - open twitch.tv",
            code: "NO_COOKIE_TOKEN"
        });
    }

    try {
        // Find user by app token
        const user = await User.findOne({ twitchAccessToken: appToken });

        if (!user) {
            return res.status(401).json({
                error: "Invalid token",
                code: "INVALID_TOKEN"
            });
        }

        if (user.isBanned) {
            return res.status(403).json({
                error: "Account banned",
                code: "BANNED"
            });
        }

        if (!user.isAllowed) {
            return res.status(403).json({
                error: "Account pending approval",
                code: "PENDING_APPROVAL"
            });
        }

        // Auto-refresh if expiring soon
        if (user.needsTokenRefresh()) {
            try {
                const refreshed = await refreshTwitchUserToken(user.twitchRefreshToken);

                user.twitchAccessToken = refreshed.accessToken;
                user.twitchRefreshToken = refreshed.refreshToken;
                user.tokenExpiresAt = refreshed.expiresAt;
                await user.save();

                // Notify client about new token
                res.setHeader('X-New-App-Token', refreshed.accessToken);
                console.log(`✅ Token refreshed for: ${user.twitchLogin}`);
            } catch {
                return res.status(401).json({
                    error: "Token refresh failed",
                    code: "REAUTH_REQUIRED"
                });
            }
        }

        req.user = user;

        const { TWITCH_CLIENT_ID, PUBLIC_CLIENT_ID } = process.env;

        // Helix API headers (use app token)
        req.twitchHeaders = {
            headers: {
                "Client-ID": TWITCH_CLIENT_ID,
                "Authorization": `Bearer ${user.twitchAccessToken}`,
            }
        };

        // GQL API headers (use cookie token)
        req.twitchGQLHeaders = {
            headers: {
                "Client-ID": PUBLIC_CLIENT_ID,
                "Authorization": `OAuth ${cookieToken}`,
                "accept-encoding": "gzip, deflate, br, zstd"
            }
        };

        next();
    } catch (error) {
        console.error('[ensureUserAuth]:', error.message);
        return res.status(500).json({ error: "Authentication failed" });
    }
};