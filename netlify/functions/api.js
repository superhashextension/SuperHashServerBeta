// netlify/functions/api.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import serverless from "serverless-http"; // <--- Import this
import { ensureAccessToken } from "../../config/twitch.js"; // Note the path adjustment (../../)
import { getBulkUserStats } from "../../controllers/twitchController.js"; // Note the path adjustment

const app = express();
const router = express.Router(); // <--- Create a Router

// Middleware
app.use(cors());
app.use(express.json());

// Routes attached to the Router instead of 'app'
router.get("/health", (req, res) => res.sendStatus(200));

// Business Logic Routes
router.post("/user/bulk", ensureAccessToken, getBulkUserStats);

// Mount the router at the path defined in netlify.toml
app.use("/api/", router);

// Export the handler instead of listening
export const handler = serverless(app);