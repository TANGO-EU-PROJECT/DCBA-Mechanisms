// middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Middleware to verify JWT authentication tokens.
 * Expects an Authorization header with format: "Bearer <token>"
 */
exports.verifyToken = (req, res, next) => {
  // Retrieve the authorization header
  const authHeader = req.headers.authorization;

  // Check if the Authorization header exists
  if (!authHeader) {
    return res.status(401).json({
      status: 'failed',
      message: 'Authorization token is missing.',
    });
  }

  // Check if the Authorization header starts with "Bearer "
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'failed',
      message: "Authorization token is malformed. It should start with 'Bearer '.",
    });
  }

  // Extract the JWT Authorization token from the Authorization header
  const authorizationToken = authHeader.split(' ')[1];

  try {
    // Verify the JWT token using the secret key
    const decoded = jwt.verify(authorizationToken, process.env.JWT_SECRET_KEY);

    // Attach the decoded information to the request object for later use (if needed)
    req.user = decoded;

    // Pass control to the next middleware/route handler
    next();
  } catch (err) {
    // Handle expired token case
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({
        status: 'failed',
        message: 'Authorization token has expired.',
      });
    }

    // Handle other errors (invalid token)
    return res.status(403).json({
      status: 'failed',
      message: 'Invalid Authorization token.',
    });
  }
};
