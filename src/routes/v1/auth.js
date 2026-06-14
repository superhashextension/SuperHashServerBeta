// routes/auth.js
import express from 'express';
import crypto from 'crypto';
import User from '../../models/User.js';
import Settings from '../../models/Settings.js';
import {
    exchangeTwitchCode,
    getTwitchUser,
    refreshTwitchUserToken,
    revokeTwitchToken,
    buildAuthUrl
} from '../../config/twitch.js';
import { handleMe, handleTwitchCallback, initiateTwitchAuth } from '../../controllers/v1/auth.controller.js';
import { loginLimiter } from '../../middleware/ratelimiter.middleware.js';

const router = express.Router();

// Pending OAuth states (use Redis in production)
const pendingStates = new Map();

/**
 * POST /api/auth/login
 * Background calls this to get the Twitch OAuth URL
 */
router.post('/twitch/init', loginLimiter, initiateTwitchAuth);

/**
 * POST /api/auth/callback
 * Background calls this after user authorizes on Twitch
 * Exchanges code for tokens, creates/updates user
 */
router.post('/twitch/callback', loginLimiter, handleTwitchCallback);

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
        log.error('[auth/verify]:', error.message);
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

            log.info(`🔄 Token refreshed: ${user.twitchLogin}`);
        }

        res.json({
            twitchToken: user.twitchAccessToken,
            user: user.toSafeObject()
        });

    } catch (error) {
        log.error('[auth/refresh]:', error.message);
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
                log.info(`👋 User logged out: ${user.twitchLogin}`);
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
                user,
                error: 'Account banned',
                code: 'BANNED'
            });
        }

        if (user.status === 'pending') {
            return res.status(403).json({
                user,
                error: 'Account pending approval',
                code: 'PENDING_APPROVAL'
            });
        }

        // User is active — they can login again
        return res.json({
            success: true,
            status: 'active',
            user,
            message: 'Account is active'
        });

    } catch (error) {
        log.error('Check user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/me', handleMe)

export default router;