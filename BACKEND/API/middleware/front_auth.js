const jwt = require('jsonwebtoken');

/**
 * Middleware to verify JWT authentication tokens from cookies.
 * Expects the token to be stored in a cookie named "authToken".
 */
exports.verifyFrontendToken = (req, res, next) => {
  // Retrieve the JWT token from the cookies
  const authorizationToken = req.cookies.authToken;

  // Check if the token is missing
  if (!authorizationToken) {
    return res.status(401).json({
      status: 'failed',
      message: 'Authorization token is missing.',
    });
  }

  try {
    // Verify the JWT token using the secret key
    const decoded = jwt.verify(authorizationToken, process.env.JWT_SECRET_KEY);

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
