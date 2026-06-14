import mongoose from "mongoose"

const deviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    deviceId: String,

    browser: String,

    os: String,

    firstIp: String,

    lastIp: String,

    revoked: {
      type: Boolean,
      default: false
    },

    lastSeen: Date
  },
  {
    timestamps: true
  }
)

export default mongoose.model(
  "Device",
  deviceSchema
)