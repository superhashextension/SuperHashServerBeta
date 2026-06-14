// config/db.js
import mongoose from 'mongoose';
import dns from 'node:dns';

export async function connectDB() {
    try {
        dns.setDefaultResultOrder('ipv4first');
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        log.info('MongoDB connected');
    } catch (error) {
        log.fatal( error , 'MongoDB connection failed');
        process.exit(1);
    }
}

export const getDatabaseStatus = () => {
    const stateMap = {
        0: 'DISCONNECTED',
        1: 'CONNECTED',
        2: 'CONNECTING',
        3: 'DISCONNECTING'
    };

    const numericState = mongoose.connection.readyState;

    return {
        readable: stateMap[numericState] || 'UNKNOWN',
        isConnected: numericState === 1 // Helper boolean for quick evaluations
    };
};

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    log.info('MongoDB disconnected');
    process.exit(0);
});