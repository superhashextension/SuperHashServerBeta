// IN YOUR rateLimiter.js FILE:
import rateLimit from "express-rate-limit";

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    // ✅ Fix: Return standard JSON structures
    handler: (req, res, next, options) => {
        res.status(429).json({
            status: "error",
            message: "Too many login attempts, try again later"
        });
    }
});

export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    // ✅ Fix: Return standard JSON structures
    handler: (req, res, next, options) => {
        res.status(429).json({
            status: "error",
            message: "Too many requests, try again later"
        });
    }
});
