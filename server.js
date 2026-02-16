// server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { ensureAccessToken } from "./config/twitch.js";
import { getUserStats } from "./controllers/twitchController.js";
import { corsOptions } from "./config/cors.js";

const app = express();

app.use(express.json());
app.use(cors(corsOptions));

app.get("/health", (req, res) => res.sendStatus(200));
app.post("/user", ensureAccessToken, getUserStats);

// EXPORT instead of app.listen()
export default app;

// Start the server
// const PORT = process.env.PORT
// app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });
