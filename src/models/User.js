// models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    twitchId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    twitchLogin: {
        type: String,
        required: true
    },
    displayName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        index: true
    },
    profileImageUrl: String,

    status: {
        type: String,
        enum: ['pending', 'allowed', 'banned'],
        default: 'pending',
        index: true // Highly optimized index for administrative lookups and login guards
    },

    role: {
        type: String,
        enum: ['user', 'premium', 'admin'],
        default: 'user'
    },

    deviceLimit: { type: Number, default: 1 },       // Max simultaneous devices
    ipLimit: { type: Number, default: 5 },           // Max unique IPs allowed

    lastLoginAt: Date,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

userSchema.methods.toSafeObject = function () {
    return {
        id: this._id,
        twitchId: this.twitchId,
        login: this.twitchLogin,        // ← Return as 'login' in API
        displayName: this.displayName,
        email: this.email,
        profileImageUrl: this.profileImageUrl,
        status: this.status,
        role: this.role,
        createdAt: this.createdAt,
        lastLoginAt: this.lastLoginAt
    };
};

// userSchema.methods.needsTokenRefresh = function () {
//     return this.tokenExpiresAt.getTime() < Date.now() + (60 * 60 * 1000);
// };

userSchema.methods.needsTokenRefresh = async function () {
    try {
        // Query your isolated token metadata home safely
        const tokenDoc = await TwitchToken.findOne({ userId: this._id });

        // If the user doesn't have cached tokens, they don't need a background refresh loop
        if (!tokenDoc || !tokenDoc.expiresAt) {
            return false;
        }

        const now = Date.now();
        const expiryTime = new Date(tokenDoc.expiresAt).getTime();

        // 5 minutes safety buffer threshold calculation (5 * 60 * 1000 = 300000ms)
        const buffer = 5 * 60 * 1000;

        return (expiryTime - now) < buffer;
    } catch (error) {
        log.error({ err: error.message }, 'Failed to compute token expiration delta metrics');
        return false;
    }
};


export default mongoose.model('User', userSchema);