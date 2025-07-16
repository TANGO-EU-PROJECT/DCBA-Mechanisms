// -------------------------------- External Services API Routes -------------------------------- //
const express = require('express');
const router = express.Router();
const controller = require('../controllers/controller'); // Import the controller with the logic for handling requests
const { verifyToken } = require('../middleware/auth');  // Import the middleware auth.js for access token verification


const resourceControllers = {
  /************************************************** GET REQUESTS **************************************************/
  /** [1] DONE
   * @route   GET /resource/devices
   * @desc    Fetch all devices from the database.
   * @middleware PEP/PDP
   */
  "devices": controller.fetchDevices,


  /** [2] DONE
 * @route   GET /resource/online-devices
 * @desc    Fetches the online devices
 * @middleware PEP/PDP
 */
  "online-devices": controller.fetchOnlineDevices,

  /** [3] DONE
   * @route   GET /resource/offline-devices
   * @desc    Fetches the offline devices
   * @middleware PEP/PDP
   */
  "offline-devices": controller.fetchOfflineDevices,

  /** [4] DONE
   * @route   GET /resource/alerts
   * @desc    Returns all the possible alerts for devices navigating to restricted areas
   * @middleware PEP/PDP
   */
  "alerts": controller.fetchDevicesAlerts,
  /************************************************** GET REQUESTS **************************************************/








  /************************************************** POST REQUESTS **************************************************/
  /** [5] done
   * @route   POST /resource/behavioural-score
   * @desc    Returns the devices's behavioural score based on provided DIDs.
   * @middleware PEP/PDP
   */
  "behavioural-score": controller.fetchDeviceBehaviouralScore,


  /** [6] done
   * @route   POST /resource/last-location
   * @desc    Returns the devices's last location based on provided DIDs.
   * @middleware PEP/PDP
   */
  "last-location": controller.fetchDeviceLastLocation,

  /** [7] done
   * @route   POST /resource/location-history
   * @desc    Returns the device’s location history within a specified timeframe, based on provided DIDs.
   * @middleware PEP/PDP
   */
  "location-history": controller.fetchDeviceLocationHistory,

  /** [8] done
   * @route   POST /resource/permitted-location-history
   * @desc    Returns the devices's permitted location history within a specified timeframe, based on provided DIDs and authorization.
   * @middleware PEP/PDP
   */
  "permitted-location-history": controller.fetchDevicePermittedLocationHistory,


  /** [9] done
   * @route   POST /resource/restricted-location-history
   * @desc    Returns the devices's restricted location history within a specified timeframe, based on provided DIDs and authorization.
   * @middleware PEP/PDP
   */
  "restricted-location-history": controller.fetchDeviceRestrictedLocationHistory,
  /************************************************** POST REQUESTS **************************************************/






  /************************************************** DELETE REQUESTS **************************************************/
  /** [10]
   * @route   DELETE /resource/delete-employee
   * @desc    Deletes a device with the associated did
   * @middleware PEP/PDP
   */
  "delete-employee": controller.deleteDeviceByDID,
  /************************************************** DELETE REQUESTS **************************************************/
};







/********************** GET REQUESTS **********************/
router.get('/:resourceName', async (req, res) => {
  const resourceName = req.params.resourceName;
  const fetchFunction = resourceControllers[resourceName];

  if (!fetchFunction) {
    return res.status(404).json({
      status: "failed",
      message: "Cannot GET. Resource not found"
    });
  }

  try {
    // Call the matched controller function and forward req, res
    await fetchFunction(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "failed",
      message: `Error fetching resource`,
    });
  }
});
/********************** GET REQUESTS **********************/



/********************** POST REQUESTS **********************/
router.post('/:resourceName', async (req, res) => {
  try {
    const { resourceName } = req.params;
    const postHandler = resourceControllers[resourceName];

    if (!postHandler) {
      return res.status(404).json({
        status: "failed",
        message: `Cannot POST. Resource not found`
      });
    }

    await postHandler(req, res);

  } catch (err) {
    console.error("POST error:", err);
    res.status(500).json({
      status: "failed",
      message: "Error processing request"
    });

  }
});

/********************** POST REQUESTS **********************/


/********************** DELETE REQUESTS **********************/
router.delete('/:resourceName', async (req, res) => {
  const resourceName = req.params.resourceName;
  const deleteHandler = resourceControllers[resourceName];

  if (!deleteHandler) {
    return res.status(404).json({
      status: "failed",
      message: "Cannot DELETE. Resource not found"
    });
  }

  try {
    await deleteHandler(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "failed",
      message: "Error deleting resource",
    });
  }
});
/********************** DELETE REQUESTS **********************/


module.exports = router;
// -------------------------------- External Services API Routes -------------------------------- //
