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
        console.log('✅ MongoDB connected');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        process.exit(1);
    }
}

process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log('MongoDB disconnected');
    process.exit(0);
});