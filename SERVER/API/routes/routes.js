/* Contains user's route definitions, specifying what each endpoint should do. */ 

const express = require('express');
const router = express.Router();
const controller = require('../controllers/controller'); // Import user controller


// GET /users - Fetch all users
router.get('/', controller.getUsers); 

// POST /users/login/request - Login request endpoint
router.post('/login/request', controller.loginRequest); 

// POST /users/login/request/upload/signature - Upload signature for authentication(log in)
router.post('/login/request/upload/signature', controller.uploadSignature);  

// POST /users/register/request - Register request endpoint
router.post('/register/request', controller.registerRequest);  

// POST /users/register/request/upload/credential - Upload credential for registration(register)
router.post('/register/request/upload/credential', controller.uploadCredential);  

// POST /users/android/log/capture - Upload android logs
router.post('/android/log/capture', controller.LogCapture); 

// GET /users/validateToken - Validate JWT token
router.get('/validateToken', controller.validateToken); 

// POST /users/logout - Logout request endpoint
router.post('/logout', controller.logout);  // Logout request

module.exports = router;
