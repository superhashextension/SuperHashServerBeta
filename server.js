// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from 'helmet';
import mongoSanitize from "express-mongo-sanitize";
import { connectDB } from "./config/db.js";
import { ensureUserAuth } from "./config/twitch.js";
import { getUserServerStats, getUserStats } from "./controllers/twitchController.js";
import { corsOptions } from "./config/cors.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";

const app = express();

// Connect to MongoDB
await connectDB();

// Middleware
app.use(helmet());
app.use(express.json());
app.use(cors(corsOptions));
app.use(mongoSanitize());

// Routes
app.get("/health", (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

// Auth & Admin routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

// Protected routes - require user authentication
app.post("/api/user", ensureUserAuth, getUserStats);
app.post("/api/user-server", ensureUserAuth, getUserServerStats);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

export default app;