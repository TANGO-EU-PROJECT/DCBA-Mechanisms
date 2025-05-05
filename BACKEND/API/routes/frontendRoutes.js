// -------------------------------- Frontend API Routes -------------------------------- //
const express = require('express');
const router = express.Router();
const controller = require('../controllers/controller'); // Import the controller with the logic for handling requests
const { verifyFrontendToken } = require('../middleware/front_auth');  // Import the middleware auth.js for access token verification

/** [1]
 * @desc    Authenticate frontend user and return a JWT token if credentials are valid
 * @route   POST /frontend/auth-login
 * @access  Public
 */
router.post('/auth-login', controller.frontendAuthLogin);


/** [2] DONE
 * @route   GET /frontend/devices/online-shifts
 * @desc    Fetches the online devices for frontend
 * @access  Private (requires valid JWT Authorization token)
 * @middleware verifyToken
 */
router.get('/devices/online-shifts', verifyFrontendToken, controller.fetchOnlineDevicesForFrontend);


/** [3] DONE
 * @route   GET /frontend/devices/offline-shifts
 * @desc    Fetches the offline devices for frontend
 * @access  Private (requires valid JWT Authorization token)
 * @middleware verifyToken
 */
router.get('/devices/offline-shifts', verifyFrontendToken, controller.fetchOfflineDevicesForFrontend);
module.exports = router;
// -------------------------------- Frontend API Routes -------------------------------- //
