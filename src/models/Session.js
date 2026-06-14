import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true // Prevents orphan sessions with no user link
    },
    deviceId: {
      type: String,
      default: null
    },
    refreshTokenHash: {
      type: String,
      required: true,
      unique: true, // Speeds up lookups and ensures hashes never repeat
      index: true   // Critical index for high-speed authentication lookups
    },
    ip: String,
    userAgent: String,
    revoked: {
      type: Boolean,
      default: false,
      index: true // Highly optimized index so your filters can skip revoked logs instantly
    },
    expiresAt: {
      type: Date,
      required: true
    },
    lastSeen: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// 🚀 CRITICAL PRO INDEX: Automatic Database Self-Cleaning Engine
// This tells MongoDB to automatically drop and delete the session document
// the exact second your calculated 'expiresAt' timestamp passes.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, isActive: 1 });

export default mongoose.model("Session", sessionSchema);
