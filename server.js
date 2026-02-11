import "dotenv/config";
import express from "express";
import cors from "cors";
import { ensureAccessToken } from "./config/twitch.js";
import { getBulkUserStats } from "./controllers/twitchController.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors()); // Configure with your specific options file if needed

// Routes
app.get("/health", (req, res) => res.sendStatus(200));

// Business Logic Routes
app.post("/user/bulk", ensureAccessToken, getBulkUserStats);

app.listen(PORT, () => {
    console.log(`🚀 Server active at http://localhost:${PORT}`);
});
