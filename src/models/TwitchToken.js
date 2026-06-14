import mongoose from 'mongoose';

const twitchTokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    // These strings should be run through an encryption helper before saving
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiresAt: { type: Date, required: true }
}, { timestamps: true });



export default mongoose.model('TwitchToken', twitchTokenSchema);
