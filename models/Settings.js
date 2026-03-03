// models/Settings.js
import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    value: mongoose.Schema.Types.Mixed
});

settingsSchema.statics.get = async function (key, defaultValue = null) {
    const setting = await this.findOne({ key });
    return setting ? setting.value : defaultValue;
};

settingsSchema.statics.set = async function (key, value) {
    return this.findOneAndUpdate(
        { key },
        { key, value },
        { upsert: true, new: true }
    );
};

export default mongoose.model('Settings', settingsSchema);