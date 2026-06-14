import { Router } from "express";
import authRoutes from "./auth.js";
import adminRoutes from "./admin.js";
import v1authRoutes from "./v1/auth.js";
import v1adminRoutes from "./v1/admin.js";
import { ensureUserAuth } from "../config/twitch.js";
import { getUserServerStats, getUserStats } from "../controllers/twitch.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const apiRouter = Router();

// Legacy / Default Routes
apiRouter.use("/auth", authRoutes);
apiRouter.use("/admin", adminRoutes);

// API v1 Routes
apiRouter.use("/v1/auth",  v1authRoutes);
apiRouter.use("/v1/admin", v1adminRoutes);

// Protected routes - require user authentication
apiRouter.post("/users", ensureUserAuth, getUserStats);
apiRouter.post("/user-servers", ensureUserAuth, getUserServerStats);

apiRouter.post("/v1/users", authenticate, getUserStats);
apiRouter.post("/v1/user-servers", authenticate, getUserServerStats);



export default apiRouter;
