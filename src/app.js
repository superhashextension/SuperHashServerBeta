import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from 'helmet';
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import pinoHttp from "pino-http";

// 1. Initialize Logger Config First
import { logger } from "./config/logger.js";
// Essential: Make 'log' available globally before initializing modules that depend on it
globalThis.log = logger;

// 2. Load Core Application Settings & Local Modules
import { corsOptions } from "./config/cors.js";
import apiRoutes from "./routes/api.js";
import "./config/redis.js"; // This can safely run now because globalThis.log is active
import { getHealthStatus } from "./controllers/v1/health.controller.js";
import { notFound, errorHandler } from './middleware/error.middleware.js';
import { apiLimiter } from "./middleware/ratelimiter.middleware.js";

const app = express();

// ==========================================
// Global Middleware Stack
// ==========================================
app.use(pinoHttp({ logger })); // Run HTTP logger first to track incoming requests accurately
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(mongoSanitize()); // Defends MongoDB against NoSQL Injection payloads

// ==========================================
// Routing Layer
// ==========================================
app.get("/health", getHealthStatus); // Exposed root-level health utility check
app.use("/api", apiLimiter, apiRoutes);          // Main application router prefix

// ==========================================
// Fallback & Safety Error Handlers
// ==========================================
app.use(notFound);     // Catches any untracked requests and forwards a 404
app.use(errorHandler); // Intercepts all processing pipeline errors globally

export default app;
