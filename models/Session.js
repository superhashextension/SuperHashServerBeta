import mongoose from "mongoose"

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    deviceId: String,

    refreshTokenHash: String,

    ip: String,

    userAgent: String,

    revoked: {
      type: Boolean,
      default: false
    },

    expiresAt: Date,

    lastSeen: Date
  },
  {
    timestamps: true
  }
)

export const Session = mongoose.model(
  "Session",
  sessionSchema
)