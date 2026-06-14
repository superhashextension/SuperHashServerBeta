// middleware/admin.js

export function adminAuth(req, res, next) {
    console.log(req.method, req.originalUrl);
    const authHeader = req.headers.authorization;
    console.log('Authorization header:', authHeader);

    if (!authHeader?.startsWith('Basic ')) {
        console.log('[ADMIN_AUTH]:','Missing or invalid Authorization header');
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).json({ error: 'Admin auth required' });
    }

    const base64 = authHeader.split(' ')[1];
    const [username, password] = Buffer.from(base64, 'base64').toString().split(':');

    if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
        console.log('username:', username);
        console.log('process.env.ADMIN_USERNAME:', process.env.ADMIN_USERNAME);
        console.log('password:', password);
        console.log('process.env.ADMIN_PASSWORD:', process.env.ADMIN_PASSWORD);
        console.log('[ADMIN_AUTH]:','Invalid admin credentials');
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    next();
}