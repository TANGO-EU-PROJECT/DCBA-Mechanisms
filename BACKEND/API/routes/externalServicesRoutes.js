// -------------------------------- External Services API Routes -------------------------------- //
const express = require('express');
const router = express.Router();
const controller = require('../controllers/controller'); // Import the controller with the logic for handling requests
const { verifyToken } = require('../middleware/auth');  // Import the middleware auth.js for access token verification


/** [1] DONE
 * @route   GET /devices
 * @desc    Fetch all devices from the database.
 * @access  Private (requires valid JWT Authorization token)
 * @middleware verifyToken
 */
router.get('/', verifyToken, controller.fetchDevices);


/** [2] DONE
 * @route   GET /devices/online-shifts
 * @desc    Fetches the online devices
 * @access  Private (requires valid JWT Authorization token)
 * @middleware verifyToken
 */
router.get('/online-shifts', verifyToken, controller.fetchOnlineDevices);


/** [3] DONE
 * @route   GET /devices/offline-shifts
 * @desc    Fetches the offline devices
 * @access  Private (requires valid JWT Authorization token)
 * @middleware verifyToken
 */
router.get('/offline-shifts', verifyToken, controller.fetchOfflineDevices);


/** [5] DONE
 * @route   POST /devices/behavioural-score
 * @desc    Returns the devices's behavioural score based on provided DIDs and authorization.
 * @access  Restricted – Requires jwtAuth for access in the req.body
 */
router.post('/behavioural-score', controller.fetchDeviceBehaviouralScore);


/** [6] DONE
 * @route   POST /devices/last-location
 * @desc    Returns the devices's last known geographic coordinates based on provided DIDs and authorization.
 * @access  Restricted – Requires jwtAuth for access
 */
router.post('/last-location', controller.fetchDeviceLastLocation);

module.exports = router;
// -------------------------------- External Services API Routes -------------------------------- //
