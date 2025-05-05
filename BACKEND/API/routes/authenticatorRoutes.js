// -------------------------------- Authenticator API Routes -------------------------------- //
const express = require('express');
const router = express.Router();
const controller = require('../controllers/controller'); // Import the controller with the logic for handling requests


/** [1] DONE
 * @route   POST /authenticator/begin-session
 * @desc    Hanlde device initiation process(QR SCANNER)
 * @access  Public
 */
router.post('/begin-session', controller.beginSession);


/** [2] DONE
 * @route   GET /authenticator/auth-callback
 * @desc    Handle authentication callback and retrieve the access token.
 * @access  Public
 */
router.get('/auth-callback', controller.handleAuthCallback);


/** [3] DONE
 * @route   POST /authenticator/post-logs
 * @desc    Accept logs from the Android devices, for processing or analysis.
 * @access  Private (requires an access Token)
 */
router.post('/post-logs', controller.handlePostLogs);


/** [4] DONE
 * @route   GET /authenticator/auth-token-validation
 * @desc    Validate the provided Bearer JWT token to ensure it is active and valid.
 * @access  Public
 */
router.get('/auth-token-validation', controller.handleAuthTokenValidation);


/** [5] DONE
 * @route   POST /authenticator/logout
 * @desc    Handle devices logout requests by invalidating the access token.
 * @access  Public
 */
router.post('/logout', controller.handleLogout);

module.exports = router;
// -------------------------------- Authenticator Routes -------------------------------- //
