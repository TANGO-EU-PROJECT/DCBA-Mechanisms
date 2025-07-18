const express = require('express');
const router = express.Router();
const controller = require('../controllers/controller');

/************************************************** POST REQUESTS **************************************************/
/**
 * @route   POST /frontend/device-access-map
 * @desc    Create or update device access map (passport ID + permitted + restricted areas)
 */
router.post('/device-access-map', controller.createOrUpdateDeviceAccessMap);

module.exports = router;
