// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { ensureAccessToken } from "./config/twitch.js";
import { getBulkUserStats } from "./controllers/twitchController.js";

const app = express();

app.use(express.json());
app.use(cors());

app.get("/health", (req, res) => res.sendStatus(200));
app.post("/user/bulk", ensureAccessToken, getBulkUserStats);

// EXPORT instead of app.listen()
export default app;

// Start the server
// const PORT = process.env.PORT
// app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });
