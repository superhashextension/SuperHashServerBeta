import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Enforce immediate, hard system failures if secret configurations are missing on boot
if (!ACCESS_SECRET || !REFRESH_SECRET) {
    const missingKeysMsg = '❌ CRITICAL CONFIGURATION FAULT: JWT encryption secret variables are completely missing!';
    typeof log !== 'undefined' ? logger.fatal(missingKeysMsg) : console.error(missingKeysMsg);
    process.exit(1);
}

export const generateAccessToken = (payload) => {
    try {
        return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
    } catch (error) {
        log.error({ err: error.message }, 'Failed to sign access token encryption lifecycle');
        throw new Error('TOKEN_SIGNING_FAILED');
    }
};

export const generateRefreshToken = (payload) => {
    try {
        return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
    } catch (error) {
        log.error({ err: error.message }, 'Failed to sign refresh token encryption lifecycle');
        throw new Error('TOKEN_SIGNING_FAILED');
    }
};

export const verifyAccessToken = (token) => {
    try {
        return jwt.verify(token, ACCESS_SECRET);
    } catch (error) {
        if (error.name === 'TokenExpiredError') throw new Error('ACCESS_TOKEN_EXPIRED');
        if (error.name === 'JsonWebTokenError') throw new Error('ACCESS_TOKEN_INVALID');
        throw error;
    }
};

export const verifyRefreshToken = (token) => {
    try {
        return jwt.verify(token, REFRESH_SECRET);
    } catch (error) {
        if (error.name === 'TokenExpiredError') throw new Error('REFRESH_TOKEN_EXPIRED');
        if (error.name === 'JsonWebTokenError') throw new Error('REFRESH_TOKEN_INVALID');
        throw error;
    }
};
