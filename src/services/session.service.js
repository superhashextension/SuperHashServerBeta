import Session from "../models/Session.js";
import {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken
} from "../utils/jwt.util.js";
import { sha256 } from "../utils/hash.util.js";

export const createSession = async ({
    user,
    deviceId, // Generates a unique fallback string if extension didn't pass one
    ip,
    userAgent,
    expiresAt,
}) => {

        log.info({user}, "USER From DB - in params")

    // 10. Generate App Security JWT Tokens
    const tokenPayload = { id: user.twitchId, role: user.role || 'user' };
    const appAccessToken = generateAccessToken(tokenPayload);
    const appRefreshToken = generateRefreshToken(tokenPayload);

    const refreshTokenHash = sha256(appRefreshToken);

    // Calculate a strict 7-day expiration match for the session database TTL record
    const sessionExpiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);


     const newSession = await Session.create({
        userId: user._id,
        deviceId,
        refreshTokenHash,
        ip,
        userAgent,
        expiresAt,
        // lastSeen,
    });

    return {
        appAccessToken,
        appRefreshToken
    };
};

export const refreshSession = async ({
    refreshToken,
    ip,
    userAgent
}) => {
    const decoded = verifyRefreshToken(refreshToken);

    const incomingHash = sha256(refreshToken);

    const session = await Session.findOne({
        refreshTokenHash: incomingHash,
        revoked: false
    });

    // TOKEN REUSE / STOLEN TOKEN
    if (!session) {
        await Session.updateMany(
            {
                familyId: decoded.familyId
            },
            {
                revoked: true
            }
        );

        throw new Error("Refresh token reuse detected");
    }

    if (session.expiresAt < new Date()) {
        throw new Error("Session expired");
    }

    const newAccessToken = generateAccessToken({
        sub: session.userId.toString()
    });

    const newRefreshToken = generateRefreshToken({
        sub: session.userId.toString(),
        familyId: session.familyId
    });

    session.refreshTokenHash =
        sha256(newRefreshToken);

    session.lastSeen = new Date();

    session.ip = ip;

    session.userAgent = userAgent;

    await session.save();

    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
    };
};

export const revokeSession = async (
    refreshToken
) => {
    const hash = sha256(refreshToken);

    await Session.updateOne(
        {
            refreshTokenHash: hash
        },
        {
            revoked: true
        }
    );
};

export const revokeAllSessions = async (
    userId
) => {
    await Session.updateMany(
        {
            userId
        },
        {
            revoked: true
        }
    );
};