// routes/admin.js
import express from 'express';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { adminAuth } from '../middleware/admin.js';

const router = express.Router();

// All admin routes require basic auth
router.use(adminAuth);

/**
 * GET /api/admin/stats
 */
router.get('/stats', async (req, res) => {
    const [totalUsers, allowedUsers, pendingUsers, bannedUsers] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isAllowed: true }),
        User.countDocuments({ isAllowed: false, isBanned: false }),
        User.countDocuments({ isBanned: true })
    ]);

    res.json({ totalUsers, allowedUsers, pendingUsers, bannedUsers });
});

/**
 * GET /api/admin/users
 */
router.get('/users', async (req, res) => {
    const { page = 1, limit = 50, search, filter } = req.query;
    const skip = (page - 1) * limit;

    const query = {};

    // Search
    if (search) {
        query.$or = [
            { twitchLogin: new RegExp(search, 'i') },  // ← Fixed
            { displayName: new RegExp(search, 'i') },
            { email: new RegExp(search, 'i') }
        ];
    }

    // Filter
    if (filter === 'allowed') query.isAllowed = true;
    if (filter === 'pending') { query.isAllowed = false; query.isBanned = false; }
    if (filter === 'banned') query.isBanned = true;

    const [users, total] = await Promise.all([
        User.find(query)
            .select('-twitchAccessToken -twitchRefreshToken')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit)),
        User.countDocuments(query)
    ]);

    res.json({
        users,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
    });
});

/**
 * PATCH /api/admin/users/:id
 * Allow, ban, change role
 */
router.patch('/users/:id', async (req, res) => {
    const { isAllowed, isBanned, role } = req.body;

    const update = {};
    if (typeof isAllowed === 'boolean') update.isAllowed = isAllowed;
    if (typeof isBanned === 'boolean') update.isBanned = isBanned;
    if (role && ['user', 'premium', 'admin'].includes(role)) update.role = role;

    const user = await User.findByIdAndUpdate(
        req.params.id,
        update,
        { new: true }
    ).select('-twitchAccessToken -twitchRefreshToken');

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    console.log(`👤 Admin updated user ${user.twitchLogin}:`, update);

    res.json({ user });
});

/**
 * DELETE /api/admin/users/:id
 */
router.delete('/users/:id', async (req, res) => {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    console.log(`🗑️ Admin deleted user: ${user.login}`);

    res.json({ success: true });
});

/**
 * POST /api/admin/users/bulk
 */
router.post('/users/bulk', async (req, res) => {
    const { action, userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'userIds required' });
    }

    const update = {};
    if (action === 'allow') update.isAllowed = true;
    if (action === 'disallow') update.isAllowed = false;
    if (action === 'ban') update.isBanned = true;
    if (action === 'unban') update.isBanned = false;

    const result = await User.updateMany(
        { _id: { $in: userIds } },
        update
    );

    console.log(`👤 Admin bulk ${action}: ${result.modifiedCount} users`);

    res.json({ success: true, modified: result.modifiedCount });
});

/**
 * GET /api/admin/settings
 */
router.get('/settings', async (req, res) => {
    const [registrationOpen, allowedEmails] = await Promise.all([
        Settings.get('registrationOpen', true),
        Settings.get('allowedEmails', [])
    ]);

    res.json({ registrationOpen, allowedEmails });
});

/**
 * PATCH /api/admin/settings
 */
router.patch('/settings', async (req, res) => {
    const { registrationOpen, allowedEmails } = req.body;

    const updates = [];

    if (typeof registrationOpen === 'boolean') {
        updates.push(Settings.set('registrationOpen', registrationOpen));
    }

    if (Array.isArray(allowedEmails)) {
        const cleaned = allowedEmails
            .map(e => e.trim().toLowerCase())
            .filter(e => e);
        updates.push(Settings.set('allowedEmails', cleaned));
    }

    await Promise.all(updates);

    console.log('⚙️ Admin updated settings');

    res.json({ success: true });
});

export default router;