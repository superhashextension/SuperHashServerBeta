export const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      `chrome-extension://${process.env.EXTENSION_ID}`
    ];
    
    // Allow requests with no origin (server-to-server, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in whitelist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // In development, allow any chrome extension
    if (process.env.NODE_ENV === 'development' && origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }
    
    // Reject
    callback(new Error(`CORS not allowed for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-twitch-auth-token',  // ← Add your custom header here
    'X-Twitch-Auth-Token'   // ← Also add capitalized version for safety
  ],
  optionsSuccessStatus: 200
};
