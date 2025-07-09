// -------------------------------- External Services API Routes -------------------------------- //
const express = require('express');
const router = express.Router();
const controller = require('../controllers/controller'); // Import the controller with the logic for handling requests
const { verifyToken } = require('../middleware/auth');  // Import the middleware auth.js for access token verification


const resourceControllers = {
  /* GET */
  devices: controller.fetchDevices,
  online: controller.fetchOnlineDevices,
  offline: controller.fetchOfflineDevices,
  alerts: controller.fetchDevicesAlerts,

  /* POST */
  behavioural_score: controller.fetchDeviceBehaviouralScore,
  last_location: controller.fetchDeviceLastLocation,
  location_history: controller.fetchDeviceLocationHistory,
  permitted_location_history: controller.fetchDevicePermittedLocationHistory,
  restricted_location_history: controller.fetchDeviceRestrictedLocationHistory
};


/********************** GET REQUESTS **********************/
// /** [1] DONE
//  * @route   GET /devices
//  * @desc    Fetch all devices from the database.
//  * @access  Private (requires valid JWT Authorization token)
//  * @middleware PEP/PDP
//  */
// router.get('/',controller.fetchDevices);


// /** [2] DONE
//  * @route   GET /devices/online-shifts
//  * @desc    Fetches the online devices
//  * @access  Private (requires valid JWT Authorization token)
//  * @middleware PEP/PDP
//  */
// router.get('/online-shifts',controller.fetchOnlineDevices);


// /** [3] DONE
//  * @route   GET /devices/offline-shifts
//  * @desc    Fetches the offline devices
//  * @access  Private (requires valid JWT Authorization token)
//  * @middleware PEP/PDP
//  */
// router.get('/offline-shifts', controller.fetchOfflineDevices);


// /** [4] DONE
//  * @route   GET /devices/fetch-alert-history
//  * @desc    Returns all the possible alerts for devices navigating to restricted areas
//  * @access  Restricted – Requires jwtAuth for access
//  * @middleware PEP/PDP
//  */
// router.get('/fetch-alert-history', controller.fetchDevicesAlerts);
router.get('/resource/:resourceName', async (req, res) => {
  const resourceName = req.params.resourceName;
  const fetchFunction = resourceControllers[resourceName];

  if (!fetchFunction) {
    return res.status(404).json({
      status: "failed",
      message: `Resource '${resourceName}' not found`
    });
  }

  try {
    // Call the matched controller function and forward req, res
    await fetchFunction(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "failed",
      message: `Error fetching resource '${resourceName}'`,
    });
  }
});
/********************** GET REQUESTS **********************/







/********************** POST REQUESTS **********************/
// /** [5] DONE
//  * @route   POST /devices/behavioural-score
//  * @desc    Returns the devices's behavioural score based on provided DIDs and authorization.
//  * @access  Restricted – Requires jwtAuth for access in the req.body
//  */
// router.post('/behavioural-score', verifyToken, controller.fetchDeviceBehaviouralScore);


// /** [6] DONE
//  * @route   POST /devices/last-location
//  * @desc    Returns the devices's last location based on provided DIDs and authorization.
//  * @access  Restricted – Requires jwtAuth for access
//  */
// router.post('/last-location', verifyToken, controller.fetchDeviceLastLocation);


// /** [7] DONE
//  * @route   POST /devices/location-history
//  * @desc    Returns the device’s location history within a specified timeframe, based on provided DIDs and authorization.
//  * @access  Restricted – Requires jwtAuth for access
//  */
// router.post('/location-history', verifyToken, controller.fetchDeviceLocationHistory);

// /** [8] DONE
//  * @route   POST /devices/permitted-location-history
//  * @desc    Returns the devices's permitted location history within a specified timeframe, based on provided DIDs and authorization.
//  * @access  Restricted – Requires jwtAuth for access
//  */
// router.post('/permitted-location-history', verifyToken, controller.fetchDevicePermittedLocationHistory);

// /** [9] DONE
//  * @route   POST /devices/restricted-location-history
//  * @desc    Returns the devices's restricted location history within a specified timeframe, based on provided DIDs and authorization.
//  * @access  Restricted – Requires jwtAuth for access
//  */
// router.post('/restricted-location-history', verifyToken, controller.fetchDeviceRestrictedLocationHistory);
router.post('/resource', async (req, res) => {
  const resourceUrl = req.body?.sar?.resource;

  if (!resourceUrl) {
    return res.status(400).json({
      status: "failed",
      message: "Missing resource URL in request body",
    });
  }

  const parts = resourceUrl.split('/');
  const resourceName = parts[parts.length - 1];

  const fetchFunction = resourceControllers[resourceName];

  if (!fetchFunction) {
    return res.status(404).json({
      status: "failed",
      message: `Resource '${resourceName}' not found`,
    });
  }

  try {
    // Call the matched controller function and forward req, res
    await fetchFunction(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "failed",
      message: `Error fetching resource '${resourceName}'`,
    });
  }
});

/********************** POST REQUESTS **********************/


/********************** DELETE REQUESTS **********************/
/** [10]
 * @route   DELETE /devices/delete-employee
 * @desc    Deletes a device with the associated did
 * @access  Restricted – Requires jwtAuth for access
 */
router.delete('/delete-employee', verifyToken, controller.deleteDeviceByDID);
/********************** DELETE REQUESTS **********************/



module.exports = router;
// -------------------------------- External Services API Routes -------------------------------- //
