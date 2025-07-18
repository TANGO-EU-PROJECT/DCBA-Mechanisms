const express = require('express');
const router = express.Router();
const path = require('path');
const controller = require('../controllers/controller');


/************************************************** POST REQUESTS **************************************************/
router.post('/device-access-map', controller.createOrUpdateDeviceAccessMap);

module.exports = router;
