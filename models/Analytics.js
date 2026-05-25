import mongoose from "mongoose"

const analyticsSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,

    event: String,

    metadata: Object,

    timestamp: {
      type: Date,
      default: Date.now
    }
  }
)

export const Analytics = mongoose.model(
  "Analytics",
  analyticsSchema
)