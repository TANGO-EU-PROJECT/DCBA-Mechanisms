// -------------------------------- Debugging API Routes -------------------------------- //
const express = require('express');
const router = express.Router();
const controller = require('../controllers/controller'); // Import the controller with the logic for handling requests


/** [1] DONE
 * @route   POST /debugging/post-debugging-logs
 * @desc    Upload debugging logs from the android smartwatch application
 * @access  Public
 */
router.post('/post-debugging-logs', controller.postDebugLogs);


/** [2] GET
 * @route   GET /debugging/get-debugging-logs
 * @desc    Fetch debugging logs for a specific device
 * @access  Public (or you can secure it later)
 * @query   device_id (required), optional: log_level, startDate, endDate
 */
router.get('/get-debugging-logs', controller.getDebugLogs);
