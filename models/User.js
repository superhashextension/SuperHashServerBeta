// models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    twitchId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    twitchLogin: {          // ← Renamed from 'login'
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

    twitchAccessToken: {
        type: String,
        required: true
    },
    twitchRefreshToken: {
        type: String,
        required: true
    },
    tokenExpiresAt: {
        type: Date,
        required: true
    },

    isAllowed: {
        type: Boolean,
        default: false
    },
    isBanned: {
        type: Boolean,
        default: false
    },
    role: {
        type: String,
        enum: ['user', 'premium', 'admin'],
        default: 'user'
    },

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
        isAllowed: this.isAllowed,
        isBanned: this.isBanned,
        role: this.role,
        createdAt: this.createdAt,
        lastLoginAt: this.lastLoginAt
    };
};

userSchema.methods.needsTokenRefresh = function () {
    return this.tokenExpiresAt.getTime() < Date.now() + (60 * 60 * 1000);
};

export default mongoose.model('User', userSchema);