/* 
 * Contains route definitions for user-related operations.
 * Each route specifies an HTTP method and endpoint, and is linked to the appropriate controller function.
 * These routes handle functionalities like user login, registration, log upload, token validation, and logout.
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/controller'); // Import the controller with the logic for handling requests
const { verifyToken } = require('../middleware/auth');  // Import the middleware auth.js for access token verification

// -------------------------------- Authenticator/Clients Routes -------------------------------- //

/** [1] DONE
 * @route   GET /devices
 * @desc    Fetch all devices from the database.
 * @access  Private (requires valid JWT Authorization token)
 * @middleware verifyToken
 */
router.get('/', verifyToken, controller.fetchDevices);

/** [2] DONE
 * @route   POST /devices/post-logs
 * @desc    Accept logs from the Android devices, for processing or analysis.
 * @access  Private (requires an access Token)
 */
router.post('/post-logs', controller.handlePostLogs);

/** [3] DONE
 * @route   GET /devices/auth-token-validation
 * @desc    Validate the provided Bearer JWT token to ensure it is active and valid.
 * @access  Public
 */
router.get('/auth-token-validation', controller.handleAuthTokenValidation);

/** [4] DONE
 * @route   POST /devices/logout
 * @desc    Handle devices logout requests by invalidating the access token.
 * @access  Public
 */
router.post('/logout', controller.handleLogout);

/** [5] DONE
 * @route   GET /devices/auth-callback
 * @desc    Handle authentication callback and retrieve the access token.
 * @access  Public
 */
router.get('/auth-callback', controller.handleAuthCallback);


/** [6] DONE
 * @route   POST /devices/begin-session
 * @desc    Hanlde device initiation process(QR SCANNER)
 * @access  Public
 */
router.post('/begin-session', controller.beginSession);

/** [7] DONE
 * @route   GET /devices/online-shifts
 * @desc    Fetches the online devices
 * @access  Private (requires valid JWT Authorization token)
 * @middleware verifyToken
 */
router.get('/online-shifts', verifyToken, controller.fetchOnlineDevices);


/** [8] DONE
 * @route   GET /devices/offline-shifts
 * @desc    Fetches the offline devices
 * @access  Private (requires valid JWT Authorization token)
 * @middleware verifyToken
 */
router.get('/offline-shifts', verifyToken, controller.fetchOfflineDevices);

/** [9] DONE
 * @route   POST /devices/behavioural-score
 * @desc    Returns the devices's behavioural score based on provided DIDs and authorization.
 * @access  Restricted – Requires jwtAuth for access in the req.body
 */
router.post('/behavioural-score', controller.fetchDeviceBehaviouralScore);

/** [10] DONE
 * @route   POST /devices/last-location
 * @desc    Returns the devices's last known geographic coordinates based on provided DIDs and authorization.
 * @access  Restricted – Requires jwtAuth for access
 */
router.post('/last-location', controller.fetchDeviceLastLocation);
// ---------------------------------------------------------------------------- //

module.exports = router;
