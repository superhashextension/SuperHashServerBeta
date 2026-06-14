/**
 * Intercepts requests that match no explicit route and forwards a 404 error
 */
export const notFound = (req, res, next) => {
    const error = new Error(`Resource Not Found - Cannot ${req.method} ${req.originalUrl}`);
    res.status(404);
    next(error); // Passes the error forward into the global error handler below
};

/**
 * Universal error-catching safety net. 
 * Overrides Express default HTML error pages and delivers consistent structured JSON responses.
 */
export const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    const isProduction = process.env.NODE_ENV === 'production';

    // 1. Log the full detailed error locally for YOU to see in your server logs
    log.error({
        err: {
            message: err.message,
            stack: err.stack,
            name: err.name
        },
        request: { method: req.method, url: req.originalUrl }
    }, `API Pipeline Error: ${err.message}`);

    // 2. Filter what gets sent to the user/frontend
    let clientMessage = err.message;
    
    // If it's a 500 crash in production, mask the raw programming error
    if (statusCode === 500 && isProduction) {
        clientMessage = 'An unexpected internal server error occurred. Please try again later.';
    }

    return res.status(statusCode).json({
        success: false,
        error: {
            message: clientMessage,
            // Completely strips out the structural code stack trace in production
            stack: isProduction ? undefined : err.stack
        }
    });
};

