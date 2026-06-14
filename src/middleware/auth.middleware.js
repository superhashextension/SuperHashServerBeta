import { verifyAccessToken } from '../utils/jwt.util.js';
import User from '../models/User.js';

/**
 * Express gatekeeper middleware to authenticate extension requests,
 * manage Twitch token lifecycles, and inject required API headers.
 */
export const authenticate = async (req, res, next) => {
    // 1. Extract application headers uniformly
    const authHeader = req.headers.authorization;
    let appToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    // Backward compatibility layer for your extension's custom header format
    if (!appToken) {
        appToken = req.headers["x-app-token"];
    }

    const cookieToken = req.headers["x-twitch-cookie"];

    // 2. Validate parameters upfront using your strict JSON response contracts
    if (!appToken) {
        return res.status(401).json({
            success: false,
            code: "NO_APP_TOKEN",
            message: "Missing application authentication token. Please log in again."
        });
    }

    if (!cookieToken) {
        return res.status(401).json({
            success: false,
            code: "NO_COOKIE_TOKEN",
            message: "Missing Twitch cookie token context. Please open twitch.tv to synchronize."
        });
    }

    try {
        // 3. Decrypt and verify your own signed system JWT token signature safely
        let decodedPayload;
        try {
            decodedPayload = verifyAccessToken(appToken);
        } catch (jwtError) {
            log.warn({ err: jwtError.message }, 'Secure endpoint accessed with an invalid or expired token signature');
            const isExpired = jwtError.message === 'ACCESS_TOKEN_EXPIRED';
            return res.status(401).json({
                success: false,
                code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
                message: isExpired ? "Access token has expired." : "Authentication session is invalid."
            });
        }

        // 4. Database Lookup: Fetch fresh user state from MongoDB using the decoded ID
        const user = await User.findById(decodedPayload.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                code: "INVALID_TOKEN",
                message: "No active user account corresponds to this session token."
            });
        }

        // 5. Access Control List (ACL) Evaluations using your unified status enum engine
        if (user.status === 'banned') {
            return res.status(403).json({
                success: false,
                code: "BANNED",
                message: "This account has been permanently suspended."
            });
        }

        if (user.status === 'pending') {
            return res.status(403).json({
                success: false,
                code: "PENDING_APPROVAL",
                message: "Account pending manual administrative approval verification."
            });
        }

        // 6. Proactive Background Token Management: Refresh Twitch tokens if they are nearing expiration
        // Assumes user.needsTokenRefresh() is defined on your User model methods
        if (typeof user.needsTokenRefresh === 'function' && await user.needsTokenRefresh()) {
            try {
                // Ensure this helper utility is imported into your file context
                const refreshed = await refreshTwitchUserToken(user.twitchRefreshToken);

                user.twitchAccessToken = refreshed.accessToken;
                user.twitchRefreshToken = refreshed.refreshToken;
                user.tokenExpiresAt = refreshed.expiresAt;
                await user.save();

                // Inject the updated access token into the response headers so the frontend extension logs it
                res.setHeader('X-New-App-Token', refreshed.accessToken);
                log.info({ user: user.twitchLogin }, "Twitch application tokens refreshed proactively in pipeline background");
            } catch (refreshErr) {
                log.error({ err: refreshErr.message }, "Background Twitch OAuth credentials rotation sequence aborted");
                return res.status(401).json({
                    success: false,
                    code: "REAUTH_REQUIRED",
                    message: "Third-party platform synchronization failed. Re-authentication is required."
                });
            }
        }

        // 7. Success Injection Path: Bind initialized configurations cleanly straight onto request parameters
        req.user = user;

        const { TWITCH_CLIENT_ID, PUBLIC_CLIENT_ID } = process.env;

        // Helix API headers configuration parameters
        req.twitchHeaders = {
            headers: {
                "Client-ID": TWITCH_CLIENT_ID,
                "Authorization": `Bearer ${user.twitchAccessToken}`,
            }
        };

        // GQL API headers configuration parameters
        req.twitchGQLHeaders = {
            headers: {
                "Client-ID": PUBLIC_CLIENT_ID,
                "Authorization": `OAuth ${cookieToken}`,
                "accept-encoding": "gzip, deflate, br, zstd"
            }
        };

        return next(); // Proceed safely to your destination route controllers
    } catch (error) {
        log.error({ err: error.message, stack: error.stack }, 'Middleware authentication pipeline processing crash');
        next(error); // Passes the error smoothly forward directly to your global error middleware
    }
};
