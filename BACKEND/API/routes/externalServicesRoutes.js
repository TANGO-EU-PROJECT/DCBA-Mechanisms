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
router.post('/behavioural-score', verifyToken, controller.fetchDeviceBehaviouralScore);


/** [6] DONE
 * @route   POST /devices/last-location
 * @desc    Returns the devices's last location based on provided DIDs and authorization.
 * @access  Restricted – Requires jwtAuth for access
 */
router.post('/last-location', controller.fetchDeviceLastLocation);


/** [7] 
 * @route   POST /devices/location-history
 * @desc    Returns the device’s location history within a specified timeframe, based on provided DIDs and authorization.
 * @access  Restricted – Requires jwtAuth for access
 */
router.post('/location-history', controller.fetchDeviceLocationHistory);

/** [8] 
 * @route   POST /devices/permitted-location-history
 * @desc    Returns the devices's permitted location history within a specified timeframe, based on provided DIDs and authorization.
 * @access  Restricted – Requires jwtAuth for access
 */
router.post('/permitted-location-history', controller.fetchDevicePermittedLocationHistory);

/** [9] 
 * @route   POST /devices/restricted-location-history
 * @desc    Returns the devices's restricted location history within a specified timeframe, based on provided DIDs and authorization.
 * @access  Restricted – Requires jwtAuth for access
 */
router.post('/restricted-location-history', controller.fetchDeviceRestrictedLocationHistory);

module.exports = router;
// -------------------------------- External Services API Routes -------------------------------- //
