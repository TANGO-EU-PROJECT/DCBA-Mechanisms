const express = require('express');
const router = express.Router();
const controller = require('../controllers/controller');

const frontendControllers = {
  /************************************************** POST REQUESTS **************************************************/
  /** [X] TODO
   * @route   POST /frontend/access-map
   * @desc    Create or update device access map (passport ID + permitted + restricted areas)
   * @middleware verifyToken
   */
  "device-access-map": controller.createOrUpdateDeviceAccessMap,
};
module.exports = router;
