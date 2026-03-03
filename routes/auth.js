// routes/auth.js
import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import {
    exchangeTwitchCode,
    getTwitchUser,
    refreshTwitchUserToken,
    revokeTwitchToken,
    buildAuthUrl
} from '../config/twitch.js';

const router = express.Router();

// Pending OAuth states (use Redis in production)
const pendingStates = new Map();

/**
 * POST /api/auth/init
 * Background calls this to get the Twitch OAuth URL
 */
router.post('/init', (req, res) => {
    const { redirectUri } = req.body;

    if (!redirectUri) {
        return res.status(400).json({ error: 'redirectUri required' });
    }

    const state = crypto.randomBytes(16).toString('hex');

    pendingStates.set(state, {
        redirectUri,
        createdAt: Date.now()
    });

    // Auto-clean after 10 minutes
    setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000);

    const authUrl = buildAuthUrl(redirectUri, state);

    res.json({ authUrl, state });
});

/**
 * POST /api/auth/callback
 * Background calls this after user authorizes on Twitch
 * Exchanges code for tokens, creates/updates user
 */
router.post('/callback', async (req, res) => {
    const { code, state, redirectUri } = req.body;


    // Verify state
    const pending = pendingStates.get(state);
    if (!pending) {
        return res.status(400).json({ error: 'Invalid or expired state' });
    }
    pendingStates.delete(state);

    try {
        // Exchange code for Twitch tokens
        const tokens = await exchangeTwitchCode(code, redirectUri);

        // Get Twitch user info
        const twitchUser = await getTwitchUser(tokens.accessToken);

        // Validate Twitch response
        if (!twitchUser) {
            return res.status(400).json({ error: 'Failed to get Twitch user data' });
        }

        if (!twitchUser.login && !twitchUser.email) {
            return res.status(400).json({
                error: 'Incomplete Twitch user data',
                received: twitchUser
            });
        }

        if (!twitchUser?.email) {
            return res.status(400).json({
                error: 'Could not get email from Twitch'
            });
        }

        // Check registration settings
        const registrationOpen = await Settings.get('registrationOpen', true);
        const allowedEmails = await Settings.get('allowedEmails', []);

        let user = await User.findOne({ twitchId: twitchUser.id });

        // New user
        if (!user) {
            if (!registrationOpen) {
                return res.status(403).json({
                    error: 'Registration is currently closed',
                    code: 'REGISTRATION_CLOSED'
                });
            }

            const isEmailAllowed = allowedEmails.length === 0 ||
                allowedEmails.includes(twitchUser.email.toLowerCase());

            user = await User.create({
                twitchId: twitchUser.id,
                twitchLogin: twitchUser.login,              // ← Fixed
                displayName: twitchUser.display_name,
                email: twitchUser.email,
                profileImageUrl: twitchUser.profile_image_url,
                twitchAccessToken: tokens.accessToken,
                twitchRefreshToken: tokens.refreshToken,
                tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
                isAllowed: isEmailAllowed,
                lastLoginAt: new Date()
            });

            console.log(`📝 New user registered: ${user.twitchLogin} (${user.email})`);
        } else {
            // Existing user - update tokens
            user.twitchAccessToken = tokens.accessToken;
            user.twitchRefreshToken = tokens.refreshToken;
            user.tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
            user.twitchLogin = twitchUser.login;            // ← Fixed
            user.displayName = twitchUser.display_name;
            user.profileImageUrl = twitchUser.profile_image_url;
            user.email = twitchUser.email;
            user.lastLoginAt = new Date();
            await user.save();

            console.log(`🔄 User updated: ${user.twitchLogin}`);
        }

        // Check access
        if (user.isBanned) {
            return res.status(403).json({
                error: 'Account banned',
                code: 'BANNED',
                user: user.toSafeObject()
            });
        }

        if (!user.isAllowed) {
            return res.status(403).json({
                error: 'Account pending approval',
                code: 'PENDING_APPROVAL',
                user: user.toSafeObject()
            });
        }

        // Return token that extension will store and send as x-app-token
        res.json({
            twitchToken: user.twitchAccessToken,
            user: user.toSafeObject()
        });

    } catch (error) {
        console.error('[auth/callback]:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/auth/verify
 * Background calls this to check if token is still valid
 */
router.get('/verify', async (req, res) => {
    const appToken = req.headers['x-app-token'];

    if (!appToken) {
        return res.status(401).json({ error: 'No token', code: 'NO_APP_TOKEN' });
    }

    try {
        const user = await User.findOne({ twitchAccessToken: appToken });

        if (!user) {
            return res.status(401).json({
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }

        if (user.isBanned) {
            return res.status(403).json({
                error: 'Account banned',
                code: 'BANNED',
                user: user.toSafeObject()
            });
        }

        if (!user.isAllowed) {
            return res.status(403).json({
                error: 'Account pending approval',
                code: 'PENDING_APPROVAL',
                user: user.toSafeObject()
            });
        }

        // Auto-refresh if needed
        if (user.needsTokenRefresh()) {
            try {
                const refreshed = await refreshTwitchUserToken(user.twitchRefreshToken);

                user.twitchAccessToken = refreshed.accessToken;
                user.twitchRefreshToken = refreshed.refreshToken;
                user.tokenExpiresAt = refreshed.expiresAt;
                await user.save();

                res.setHeader('X-New-App-Token', refreshed.accessToken);
            } catch {
                return res.status(401).json({
                    error: 'Token expired',
                    code: 'REAUTH_REQUIRED'
                });
            }
        }

        res.json({
            valid: true,
            user: user.toSafeObject()
        });

    } catch (error) {
        console.error('[auth/verify]:', error.message);
        res.status(500).json({ error: 'Verification failed' });
    }
});

/**
 * POST /api/auth/refresh
 * Background calls this periodically to refresh tokens
 */
router.post('/refresh', async (req, res) => {
    const { twitchToken } = req.body;

    if (!twitchToken) {
        return res.status(400).json({ error: 'Token required' });
    }

    try {
        const user = await User.findOne({ twitchAccessToken: twitchToken });

        if (!user) {
            return res.status(401).json({
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }

        if (user.isBanned || !user.isAllowed) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Only refresh if actually needed
        if (user.needsTokenRefresh()) {
            const refreshed = await refreshTwitchUserToken(user.twitchRefreshToken);

            user.twitchAccessToken = refreshed.accessToken;
            user.twitchRefreshToken = refreshed.refreshToken;
            user.tokenExpiresAt = refreshed.expiresAt;
            await user.save();

            console.log(`🔄 Token refreshed: ${user.twitchLogin}`);
        }

        res.json({
            twitchToken: user.twitchAccessToken,
            user: user.toSafeObject()
        });

    } catch (error) {
        console.error('[auth/refresh]:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/auth/logout
 * Background calls this when user logs out
 */
router.post('/logout', async (req, res) => {
    const appToken = req.headers['x-app-token'];

    if (appToken) {
        try {
            const user = await User.findOne({ twitchAccessToken: appToken });
            if (user) {
                await revokeTwitchToken(user.twitchAccessToken);
                console.log(`👋 User logged out: ${user.twitchLogin}`);
            }
        } catch {
            // Ignore errors on logout
        }
    }

    res.json({ success: true });
});

/**
 * POST /api/auth/check-user
 * Background calls this to check if a Twitch ID is registered and allowed to log in
 */
router.post('/check-user', async (req, res) => {
    try {
        const { twitchId } = req.body;

        if (!twitchId) {
            return res.status(400).json({ error: 'Missing twitchId' });
        }

        const user = await User.findOne({ twitchId });

        if (!user) {
            return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
        }

        if (user.status === 'banned') {
            return res.status(403).json({
                error: 'Account banned',
                code: 'BANNED'
            });
        }

        if (user.status === 'pending') {
            return res.status(403).json({
                error: 'Account pending approval',
                code: 'PENDING_APPROVAL'
            });
        }

        // User is active — they can login again
        return res.json({
            status: 'active',
            message: 'Account is active'
        });

    } catch (error) {
        console.error('Check user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;