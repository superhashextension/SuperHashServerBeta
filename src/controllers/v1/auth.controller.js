import bcrypt from "bcrypt"
import crypto from "crypto"
import User from "../../models/User.js"
import Device from "../../models/Device.js"
import Session from "../../models/Session.js"
import { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken } from "../../utils/jwt.util.js"
import { redis } from '../../config/redis.js';
import { buildAuthUrl, exchangeTwitchCode, getTwitchUser } from "../../config/twitch.js"
import Settings from "../../models/Settings.js"
import TwitchToken from "../../models/TwitchToken.js"
import { createSession } from "../../services/session.service.js"

export const initiateTwitchAuth = async (req, res) => {
    try {
        const { redirectUri, deviceId } = req.body;

        log.info(req.body, 'Received body');

        if (!redirectUri || !deviceId) {
            // Standardize error payloads to look consistent with our architecture
            return res.status(400).json({
                success: false,
                message: 'Parameters "redirectUri" and "deviceId" are explicitly required.'
            });
        }

        const state = crypto.randomBytes(16).toString('hex');
        log.debug({ state }, 'Generated unique state token for Twitch OAuth flow');

        // Professional Fix: Save token parameters into secure cloud memory.
        // EX: 600 sets a strict automatic self-destruct countdown timer of 10 minutes (600 seconds)
        const redisPayload = JSON.stringify({
            redirectUri,
            deviceId,
            createdAt: Date.now()
        });

        await redis.set(`auth:state:${state}`, redisPayload, { ex: 600 });

        // Build the target URL (Using a standard URL builder pattern)
        const authUrl = buildAuthUrl(redirectUri, state);

        log.info({ state }, 'Twitch redirect parameters cached inside Redis engine');

        // Always wrap your final payload inside a consistent "data" block layer
        return res.status(200).json({
            success: true,
            data: {
                authUrl,
                state
            }
        });

    } catch (error) {
        log.error({ err: error.message }, 'Failed to map background login state payload');
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
/**
 * Validates the Twitch Extension callback verification sequence
 * POST /api/v1/auth/twitch/callback
 */
export const handleTwitchCallback = async (req, res) => {
    // 1. Destructure parameters including optional tracking context from the body
    const { code, state, redirectUri, deviceId } = req.body;

    log.info({ code, state, redirectUri, deviceId }, 'Received Twitch callback with parameters');

    if (!code || !state || !redirectUri || !deviceId) {
        return res.status(400).json({
            success: false,
            message: 'Parameters "code", "state", "redirectUri", and "deviceId" are explicitly required.'
        });
    }

    // 2. Core Security: Fetch and verify tracking state key using Cloud Redis
    const cacheKey = `auth:state:${state}`;
    const cachedStateData = await redis.get(cacheKey);

    if (!cachedStateData) {
        log.warn({ state }, 'Twitch callback validation rejected due to missing or expired state token key');
        return res.status(400).json({
            success: false,
            message: 'Invalid or expired state tracking parameters. Session timed out.'
        });
    }

    // Instantly wipe the key token from Redis memory to block Replay Attack vectors
    await redis.del(cacheKey);

    try {
        // 3. Trade the authorization code for Twitch platform token sets
        const tokens = await exchangeTwitchCode(code, redirectUri);

        if (!tokens || !tokens.accessToken) {
            return res.status(400).json({ success: false, message: 'Failed to negotiate token handshakes with Twitch.' });
        }

        // 4. Retrieve live profile data from Twitch API channels
        const twitchUser = await getTwitchUser(tokens.accessToken);

        if (!twitchUser) {
            return res.status(400).json({
                success: false,
                message: 'Failed to retrieve user identity metrics from Twitch.'
            });
        }

        if (!twitchUser.login && !twitchUser.email) {
            return res.status(400).json({
                success: false,
                message: 'Incomplete user profile schema returned from Twitch engine.',
                received: twitchUser
            });
        }

        if (!twitchUser.email) {
            return res.status(400).json({
                success: false,
                message: 'Could not access registered email address. Ensure user has verified their Twitch email.'
            });
        }

        // 5. Query administrative configurations safely out of database collections
        const registrationOpen = await Settings.get('registrationOpen', true);
        const allowedEmails = await Settings.get('allowedEmails', []);

        // Search database using explicit Mongoose model reference
        let user = await User.findOne({ twitchId: twitchUser.id });

        // Normalize data structures defensively across snake_case and camelCase parameters
        const twitchLoginName = twitchUser.login;
        const displayNameString = twitchUser.display_name || twitchUser.displayName;
        const profileImageString = twitchUser.profile_image_url || twitchUser.profileImageUrl || '';
        const tokenLifespanSeconds = tokens.expiresIn || tokens.expires_in || 3600;

        // 6. Registration Flow: Process New Sign Ups
        if (!user) {
            if (!registrationOpen) {
                return res.status(403).json({
                    success: false,
                    code: 'REGISTRATION_CLOSED',
                    message: 'Registration is currently closed by the platform administrators.'
                });
            }

            const isEmailAllowed = allowedEmails.length === 0 ||
                allowedEmails.map(email => email.toLowerCase()).includes(twitchUser.email.toLowerCase());

            // Create Lightweight Core Profile Model (Tokens omitted)
            user = await User.create({
                twitchId: twitchUser.id,
                twitchLogin: twitchLoginName,
                displayName: displayNameString,
                email: twitchUser.email,
                profileImageUrl: profileImageString,
                isAllowed: isEmailAllowed,
                lastLoginAt: new Date()
            });

            log.info({ user: twitchLoginName }, `📝 New user profile registered successfully`);
        } else {
            // 7. Update Flow: Process Existing Sign Ins
            user.twitchLogin = twitchLoginName;
            user.displayName = displayNameString;
            user.profileImageUrl = profileImageString;
            user.email = twitchUser.email;
            user.lastLoginAt = new Date();

            await user.save();
            log.info({ user: twitchLoginName }, `🔄 User profile synchronized and updated successfully`);
        }

        // 8. Securely Isolate 3rd Party Platform Tokens into separate data collection
        await TwitchToken.findOneAndUpdate(
            { userId: user._id },
            {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: new Date(Date.now() + tokenLifespanSeconds * 1000)
            },
            { upsert: true }
        );

        // 9. Access Control List (ACL) Evaluations
        if (user.status === 'banned') {
            return res.status(403).json({
                success: false,
                code: 'BANNED',
                message: 'This account has been permanently banned from accessing this extension service.',
                // user: typeof user.toSafeObject === 'function' ? user.toSafeObject() : undefined
            });
        }

        if (user.status !== 'allowed') {
            return res.status(403).json({
                success: false,
                code: 'PENDING_APPROVAL',
                message: 'Account pending manual administrative approval verification.',
                // user: typeof user.toSafeObject === 'function' ? user.toSafeObject() : undefined
            });
        }

        // Count distinct IPs currently active for this user
        const clientIp = req.ip || req.headers['x-forwarded-for'];

        const uniqueIPs = await Session.distinct('ip', {
            userId: user._id,
            status : "allowed"
        });

        if (!uniqueIPs.includes(clientIp) && uniqueIPs.length >= (user.ipLimit ?? 5)) {
            log.warn({ userId: user._id, clientIp }, 'Login rejected — IP limit reached');
            return res.status(403).json({
                success: false,
                code: 'IP_LIMIT_REACHED',
                message: `Login denied. Maximum allowed IP addresses (${user.ipLimit ?? 5}) reached.`
            });
        }
        // 10. Generate App Security JWT Tokens
        const tokenPayload = { id: user._id, role: user.role || 'user' };
        const appAccessToken = generateAccessToken(tokenPayload);
        const appRefreshToken = generateRefreshToken(tokenPayload);

        // 11. Cryptographically hash the long-lived refresh token before committing to MongoDB
        const hashedRefreshToken = crypto
            .createHash('sha256')
            .update(appRefreshToken)
            .digest('hex');

        // Calculate a strict 7-day expiration match for the session database TTL record
        const sessionExpiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // 12. Create a trackable runtime record matching your custom Session schema
        // await Session.create({
        //     userId: user._id,
        //     deviceId: deviceId || crypto.randomUUID(), // Generates a unique fallback string if extension didn't pass one
        //     refreshTokenHash: hashedRefreshToken,
        //     ip: req.ip || req.headers['x-forwarded-for'],
        //     userAgent: req.headers['user-agent'],
        //     expiresAt: sessionExpiryDate,
        //     lastSeen: new Date()
        // });


        log.info({user}, "USER From DB - Before createSession call")

        await createSession({
            user,
            deviceId: deviceId || crypto.randomUUID(), // Generates a unique fallback string if extension didn't pass one
            // refreshTokenHash: hashedRefreshToken,
            ip: req.ip || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            expiresAt: sessionExpiryDate,
            // lastSeen: new Date()
        });

        // log.info({ userId: user._id }, 'Streamer account security verification complete. Session initialized.');

        // 13. Deliver uniform production JSON formatting
        return res.status(200).json({
            success: true,
            message: 'User authentication process finalized successfully.',
            data: {
                accessToken: appAccessToken,
                refreshToken: appRefreshToken, // Pass to browser client background engine for long-term handshakes
                user: typeof user.toSafeObject === 'function' ? user.toSafeObject() : user
            }
        });

    } catch (error) {
        log.error({ err: error.message, stack: error.stack }, 'Twitch authentication callback runtime execution exception caught');

        // Clean abstraction: Throw bubbles up straight into your registered error.middleware.js file
        throw error;
    }
};

export const handleMe = async (req, res) => {
    try {
        // 1. Extract the bearer token from the Authorization header or fallback header
        const authHeader = req.headers.authorization;
        let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

        // Fallback to your legacy header key if explicitly passed by the extension
        if (!token) {
            token = req.headers["x-app-token"];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                code: 'NO_APP_TOKEN',
                message: 'Missing app authentication token. Please log in again.'
            });
        }

        // 2. Decrypt and verify your own signed system JWT token payload
        let decodedPayload;
        try {
            decodedPayload = verifyAccessToken(token);
        } catch (jwtError) {
            log.warn({ err: jwtError.message }, 'Incoming /me endpoint token verification failed');
            return res.status(401).json({
                success: false,
                code: 'INVALID_APP_TOKEN',
                message: 'Authentication token is invalid or has expired.'
            });
        }

        // 3. Find user profile matching the cryptographic ID in your clean User model
        const user = await User.findById(decodedPayload.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                code: 'INVALID_APP_TOKEN',
                message: 'No active user account corresponds to this session token.'
            });
        }

        // 4. Access Control List (ACL) Status Evaluations (Matching Your Contract Format)
        if (user.status === 'banned') {
            return res.status(403).json({
                success: false,
                code: 'BANNED',
                message: 'This account has been permanently banned from accessing this extension service.'
            });
        }

        if (user.status === 'pending') {
            return res.status(403).json({
                success: false,
                code: 'PENDING_APPROVAL',
                message: 'Account pending manual administrative approval verification.'
            });
        }

        // 5. Deliver Uniform JSON Response (Perfect compliance with your frontend types)
        log.info({ userId: user._id }, 'Profile configuration synchronized successfully for active request path');

        return res.status(200).json({
            success: true,
            message: 'User profile retrieved successfully.',
            data: {
                user: typeof user.toSafeObject === 'function' ? user.toSafeObject() : user
            }
        });

    } catch (error) {
        log.error({ err: error.message, stack: error.stack }, 'Profile retrieval endpoint loop crashed');
        throw error; // Propagates out straight to your global error.middleware.js file safely
    }
};
