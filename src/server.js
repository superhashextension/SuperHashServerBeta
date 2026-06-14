import app from "./app.js";
import { connectDB } from "./config/db.js";

const PORT = process.env.PORT || 3000;

async function start() {
// Connect to MongoDB
    await connectDB()

    app.listen(PORT, () => {
        log.info(`Server running on port ${PORT}`);
    });
}

start()