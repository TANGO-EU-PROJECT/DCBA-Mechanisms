/* Contains the logic for what happens when an endpoint is hit. */
/************************************************************************************************************************************************************************************************/
require('dotenv').config();   
const config = require('./../../CONFIG/config');  /* Import server configuration settings                */
const { JSDOM } = require('jsdom');               /* Import JSDOM to simulate DOM parsing in Node.js     */

// For executing external scripts (e.g., localization and RiskAssessmentEngine)
const { exec } = require('child_process');
const https = require('https');
const fs = require('fs');
const qs = require('qs');

// ──────────────────────────────────────────────────────────────────────────────
// ANSI escape codes for colored console output to improve log readability
// ──────────────────────────────────────────────────────────────────────────────                                                                  
const green = '\x1b[32m';     /* Green color                         */
const red = '\x1b[31m';       /* Red color                           */
const yellow = '\x1b[33m';    /* Yellow color                        */
const lightBlue = '\x1b[34m'; /* Light Blue color                    */
const magenta = '\x1b[35m';   /* Magenta color                       */
const reset = '\x1b[0m';      /* Reset color to default              */

// Import necessary libraries
const path = require('path');                      // Import Path module for file path operations
const moment = require('moment');                  // For handling timestamps
const {
  storeLogsToInfluxDB,
  extractTimestamp,
  malformedLogsExaminator,
  getDeviceHeatmap,
  readEDHeatmapCSV,
  readLSOHeatmapCSV,
  readRIASTONEHeatmapCSV,
  processSessionRequest,
  findDeviceByDeviceID,
  findDeviceByDID
} = require('../../UTILITIES/functions');          // Import utility functions (database interactions, hashing, signatures, etc.)
const { MinPriorityQueue } = require('@datastructures-js/priority-queue'); // Import Min Heap

// For JWT token creation and verification
const jwt = require('jsonwebtoken');              
const axios = require('axios'); // Import axios for making HTTP/HTTPS requests

// Devices-specific log request queues and process tracking
const devicesQueues = {};                          // Stores separate queues for each device's log requests
let processingQueue = false;                       // Flag to check if a queue is being processed
const mutexes = {};                                // Stores mutexes for handling concurrent requests for each device

// Import and configure localization algorithm mode
const LOCALIZATION_ALGORITHM_APPLIED = process.env.LOCALIZATION_ALGORITHM_APPLIED;
let LocalizationHeatmapPath;
let LocalizationScriptPath;
let readHeatmapCSVFunction;

// Set up localization paths based on the algorithm type
if (LOCALIZATION_ALGORITHM_APPLIED === "LSO") {
  // Least Squares Optimization Localization
  LocalizationHeatmapPath = process.env.LSO_HEATMAP_PATH;
  LocalizationScriptPath = process.env.LSO_LOCALIZATION_PATH;
  readHeatmapCSVFunction = readLSOHeatmapCSV; 
} else if (LOCALIZATION_ALGORITHM_APPLIED === "ED") {
  // Euclidean Distance Localization
  LocalizationHeatmapPath = process.env.ED_HEATMAP_PATH;
  LocalizationScriptPath = process.env.ED_LOCALIZATION_PATH;
  readHeatmapCSVFunction = readEDHeatmapCSV; 
} else {
  //LOCALIZATION AGLGORITHM FOR "RIA"
  LocalizationHeatmapPath = process.env.RIA_HEATMAP_PATH;
  LocalizationScriptPath = process.env.RIA_LOCALIZATION_PATH;
  readHeatmapCSVFunction = readRIASTONEHeatmapCSV; 
}

// Retrieve the paths to MongoDB schema models from the environment variables
const deviceModelPath = process.env.MONGO_DB_DEVICE_SCHEME_PATH;
const sessionRequestModelPath = process.env.MONGO_DB_SESSION_REQUEST_SCHEME_PATH;

// Dynamically load the MongoDB schema models based on the paths specified in .env
const DEVICE = require(path.resolve(deviceModelPath));
const SESSION_REQUEST = require(path.resolve(sessionRequestModelPath));
/************************************************************************************************************************************************************************************************/





/** [1] 
 * Fetches all device data from the MongoDB database and returns it as a JSON response.
 * Endpoint: GET /devices
 * 
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 */
exports.fetchDevices = async (req, res) => {
  try {
    // Retrieve only selected fields from all device records
    const devices = await DEVICE.find({}, 'device_id did sub -_id');

    // Send the selected device data as a JSON response
    res.status(200).json({
      status: "success",
      message: "Devices fetched successfully.",
      data: devices,
    });

  } catch (error) {

    // Return a 500 error response if something goes wrong
    res.status(500).json({
      status: "failed",
      message: "Error fetching device data.",
    });
  }
};


/** [2]
 * Function to handle the Android Logs received from the device devices
 * Endpoint: POST /devices/post-logs
 * @param {Object} req - The request object(containing the did, the deviceID, the log and the authToken).
 * @param {Object} res - The response object.
*/
exports.handlePostLogs = async (req, res) => {
  const did = req.body.did;
  const deviceID = req.body.deviceID;
  const logData = req.body.log;
  const authToken = req.body.authToken;

  if (!logData) {
    logEvent({
      event: 'ANDROID LOG CAPTURE',
      status: 'FAILED ❌',
      cause: 'LOG DATA CANNOT BE EMPTY',
      device_id: deviceID,
      did: did,
      ip: req.ip
    });
    return res.status(200).json({ status: "failed", message: 'Log data cannot be empty.' });
  }

  if (malformedLogsExaminator(logData) === 0) {
    logEvent({
      event: 'ANDROID LOG CAPTURE',
      status: 'FAILED ❌',
      cause: 'MALFORMED LOG DETECTED',
      device_id: deviceID,
      did: did,
      ip: req.ip
    });
    console.log("CORRESPONDING MALFORMED LOG:", logData);
    return res.status(200).json({ status: "failed", message: "Malformed log detected." });
  }

  if (!authToken) {
    logEvent({
      event: 'ANDROID LOG CAPTURE',
      status: 'FAILED ❌',
      cause: 'AUTH TOKEN IS REQUIRED',
      did: did,
      device_id: deviceID,
      ip: req.ip
    });
    return res.status(200).json({ status: "failed", message: 'Authentication token is required.' });
  }

  let decodedToken;
  try {
    decodedToken = jwt.decode(authToken, { complete: true });
  } catch (error) {
    logEvent({
      event: 'ANDROID LOG CAPTURE',
      status: 'FAILED ❌',
      cause: `AN ERROR OCCURRED DURING ANDROID LOG CAPTURE. INVALID AUTHENTICATION TOKEN FORMAT: ${error.stack}`,
      did: did,
      device_id: deviceID,
      ip: req.ip
    });
    
    return res.status(200).json({ status: "failed", message: 'Invalid authentication token format.' });
  }

  if (!decodedToken) {
    logEvent({
      event: 'ANDROID LOG CAPTURE',
      status: 'FAILED ❌',
      cause: 'ACCESS TOKEN DECODE FAILED',
      did: did,
      device_id: deviceID,
      ip: req.ip
    });
    return res.status(200).json({ status: "failed", message: 'Failed to decode authentication token.' });
  }

  const currentTime = Math.floor(Date.now() / 1000);
  if (decodedToken.exp && decodedToken.exp < currentTime) {
    logEvent({
      event: 'ANDROID LOG CAPTURE',
      status: 'FAILED ❌',
      cause: 'ACCESS TOKEN EXPIRED',
      did: did,
      device_id: deviceID,
      ip: req.ip
    });
    return res.status(200).json({ status: "failed", message: 'Authentication token has expired.' });
  }

  if (decodedToken.payload?.verifiableCredential?.id !== did) {
    logEvent({
      event: 'ANDROID LOG CAPTURE',
      status: 'FAILED ❌',
      cause: 'ACCESS TOKEN DID SHOULD MATCH THE PROVIDED DID',
      did: did,
      device_id: deviceID,
      ip: req.ip
    });
    return res.status(200).json({ status: "failed", message: 'Authentication token did does not match the provided did.' });
  }

  const timestamp = extractTimestamp(logData);
  if (!timestamp) {
    logEvent({
      event: 'ANDROID LOG CAPTURE',
      status: 'FAILED ❌',
      cause: 'MISSING TIMESTAMP FROM LOG ENTRY',
      did: did,
      device_id: deviceID,
      ip: req.ip
    });
    return res.status(200).json({ status: "failed", message: 'Invalid log data. Missing timestamp.' });
  }

  const deviceQueue = getDeviceQueue(deviceID);
  deviceQueue.enqueue({ req, res, timestamp, did, deviceID});
  processDeviceQueue(deviceID);
};




/** [3]
 * Retrieves the priority queue for a specific device.
 * If the queue does not exist, it initializes a MinPriorityQueue
 * that orders logs based on their timestamps (earliest first).
 *
 * @param {string} deviceID - The unique identifier for the device.
 * @returns {MinPriorityQueue} - The priority queue for the given device.
 */
const getDeviceQueue = (deviceID) => {
  // Check if this device based on its did already has a queue; if not, create one
  if (!devicesQueues[deviceID]) {
    // Initialize a MinPriorityQueue where logs are prioritized by timestamp (smallest first)
    devicesQueues[deviceID] = new MinPriorityQueue((log) => log.timestamp);
  }

  // Return the device's queue
  return devicesQueues[deviceID];
};


/** [4]
 * Retrieves the mutex (lock) object for a specific device.
 * If the mutex does not exist, it initializes one with `locked: false`.
 * 
 * This ensures that each device has a separate lock mechanism 
 * to control concurrent log processing.
 *
 * @param {string} deviceID - The unique identifier for the device.
 * @returns {Object} - The mutex object containing the `locked` status.
 */
const getMutex = (deviceID) => {
  // Check if a mutex exists for the device; if not, create one
  if (!mutexes[deviceID]) {
    // Initialize the mutex with `locked: false` to indicate it's available
    mutexes[deviceID] = { locked: false };
  }
  // Return the device's mutex object
  return mutexes[deviceID];
};


/** [5]
 * Acquires a mutex (lock) for a specific device to ensure sequential log processing.
 * 
 * This function prevents multiple concurrent processes from handling logs 
 * for the same device at the same time. If the mutex is already locked, 
 * it waits in a loop until the lock is released.
 * 
 * @param {string} deviceID - The unique identifier for the device.
 * @returns {Promise<void>} - Resolves once the lock is acquired.
 */
const acquireMutex = async (deviceID) => {
  const mutex = getMutex(deviceID);

  // Wait until the mutex is available (not locked)
  while (mutex.locked) {
    await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to avoid busy-waiting
  }

  // Lock the mutex to indicate this device is being processed
  mutex.locked = true;
};


/** [6]
 * Releases the mutex (lock) for a specific device, allowing the next process to proceed.
 * This function marks the mutex as unlocked, indicating that log processing 
 * for the device is complete and another process can acquire the lock.
 * 
 * @param {string} deviceID - The unique identifier for the device.
 */
const releaseMutex = (deviceID) => {
  getMutex(deviceID).locked = false; // Unlock the mutex for the device
};


/** [7]
 * Processes log requests sequentially for a specific device in timestamp order.
 *
 * This function ensures that logs are processed in chronological order
 * by dequeuing the earliest log first. It also prevents concurrent processing
 * for the same device by using a mutex lock.
 *
 * @param {string} deviceID - The unique identifier for the device.
 */
const processDeviceQueue = async (deviceID) => {
  // If there's already an ongoing processing for this device, exit early
  if (processingQueue[deviceID]) return;

  // Acquire a mutex lock to prevent concurrent processing for the same device
  await acquireMutex(deviceID);
  processingQueue[deviceID] = true; // Mark this device as being processed

  try {
    // Retrieve the device's queue that holds pending log capture requests
    const deviceQueue = getDeviceQueue(deviceID);

    // Process all requests in the queue, one at a time
    while (!deviceQueue.isEmpty()) {  
      // Dequeue the next request; it includes the request, response, and did token and the deviceID
      const { req, res, timestamp, did, deviceID } = deviceQueue.dequeue();
      try {
        // Process the request with the previously verified token
        await processRequest(req, res, did, deviceID);
      } catch (error) {
        // Handle any errors during request processing and return a 500 response
        logEvent({
          event: 'PROCESSING SESSION REQUEST',
          status: 'FAILED ❌',
          cause: `AN ERROR OCCURRED DURING THE PROCESSING OF THE SESSION REQUEST: ${error.stack}`,
          did: did,
          device_id: deviceID
        });
        
        return res.status(200).json({ status: "failed", message: "Internal server error while processing session request." });
      }
    }
  } finally {
    // Ensuring that the processing flag is reset and mutex is released, even if an error occurs
    processingQueue[deviceID] = false;
    releaseMutex(deviceID);
  }
};




/** [8]
 * Handles the log capture and processing for a single request.
 *
 * This function takes the log data from the request body, stores it in the InfluxDB,
 * and then processes each log line for localization or anomaly detection.
 *
 * @param {Object} req - The Express request object containing log data.
 * @param {Object} res - The Express response object used to send a response.
 * @param {Object} decodedToken - The decoded authentication token containing device details.
 */
const processRequest = async (req, res, did, deviceID) => {
  const logData = req.body.log;
  console.log("------------------------ NEARBY ACCESS POINTS ------------------------")
  console.log(logData)
  console.log("------------------------ NEARBY ACCESS POINTS ------------------------")


  try {
    // Store the log data in the InfluxDB database asynchronously
    await storeLogsToInfluxDB(deviceID, did, logData, () => {});
  } catch (error) {
    return res.status(200).json({ status: "failed", message: "Failed to store logs in the Influx Database." });
  }

  // Split the log data into individual lines for processing
  const logLines = logData.split('\n');

  for (const line of logLines) {
    if (line.trim() !== '') {
      
      if (line.includes("WifiNetworkScannerN")) {
        // Retrieve the device heatmap from the database
        const heatmap = await getDeviceHeatmap(deviceID); // Ensure it resolves before continuing
        const heatmapJSON = JSON.stringify(heatmap);
        const escapedHeatmapJSON = heatmapJSON.replace(/"/g, '\\"'); // Escape quotes to ensure they are passed correctly to Python
        
        try {
          // Run the Localizator Script to estimate the current device location
          console.log(line);
          const stdout = await runLocalizationScript(line, deviceID, did, escapedHeatmapJSON);

          // Extract JSON part from stdout
          const result = JSON.parse(stdout);
          
          logEvent({
            event: 'PERFORMING LOCALIZATION',
            status: 'SUCCESS ✅',
            did: did,
            device_id: deviceID,
            ip: req.ip
          });

          console.log(`\n${yellow}*** LOCALIZATION APPLIED ***${reset}`);
          console.log(JSON.stringify(result, null, 2)); // Pretty print the JSON

          if (LOCALIZATION_ALGORITHM_APPLIED === 'LSO') {
            // Extract the location fields from the result object
            const latitude = result['Estimated Location (Latitude)'];
            const longitude = result['Estimated Location (Longitude)'];

            // Find the device by `did` and `device_id` and update their `last_coordinates`
            const updatedDeviceDocument = await DEVICE.findOneAndUpdate(
              { did: did, device_id: deviceID },  // Search using both `did` and `device_id`
              { 
                $set: { last_coordinates: { lat: latitude, lon: longitude } }  // Update the last device coordinates
              },
              { new: true }  // Return the updated document
            );
            
            if (!updatedDeviceDocument) {
              logEvent({
                event: 'PERFORMING LOCALIZATION (LSO)',
                status: 'FAILED ❌',
                did: did,
                device_id: deviceID,
                ip: req.ip,
                cause: 'Failed to update device last coordinates.'
              });
            } else {
              logEvent({
                event: 'UPDATING DEVICE LOCATION (LSO)',
                status: 'SUCCESS ✅',
                did: did,
                device_id: deviceID,
                ip: req.ip,
                cause: `Device coordinates updated: ${JSON.stringify(updatedDeviceDocument.last_coordinates)}`
              });
            }
          } else if (LOCALIZATION_ALGORITHM_APPLIED === 'ED'){
            // Else, the localization algorithm applies is the ED
            // Extract the necessary fields from the result object
            const estimatedLocation = result['Estimated Location'];

            // Find the device by `did` and `device_id` and update their `last_coordinates`
            const updatedDeviceDocument = await DEVICE.findOneAndUpdate(
              { did: did, device_id: deviceID },  // Search using both `did` and `device_id`
              { 
                $set: { last_location: estimatedLocation }  // Update the last device coordinates
              },
              { new: true }  // Return the updated document
            );

            if (!updatedDeviceDocument) {
              logEvent({
                event: 'PERFORMING LOCALIZATION (RIA)',
                status: 'FAILED ❌',
                did: did,
                device_id: deviceID,
                ip: req.ip,
                cause: 'Failed to update device last location.'
              });
            } else {
              logEvent({
                event: 'UPDATING DEVICE LOCATION (RIA)',
                status: 'SUCCESS ✅',
                did: did,
                device_id: deviceID,
                ip: req.ip,
                cause: `Device last location updated: ${JSON.stringify(updatedDeviceDocument.last_location)}`
              });
            }
          }

        } catch (localizationError) {
          logEvent({
            event: 'PARSING LOCALIZATION OUTPUT',
            status: 'FAILED ❌',
            cause: `AN ERROR OCCURRED DURING PARSING LOCALIZATION OUTPUT: ${localizationError}`,
            did: did,
            device_id: deviceID,
            ip: req.ip
          });

          return res.status(200).json({ status: "failed", message: "Failed to perform localization." });
        }
      }
    }
  }

  // Send a success response once log processing is complete
  return res.status(200).json({ status: "success", message: "Logs stored, analyzed and processed successfully." });
};


/* [9]
 * Function to handle the localization algorithm
*/
const runLocalizationScript = (line, deviceID, did, escapedHeatmapJSON) => {
  return new Promise((resolve, reject) => {
    exec(`python3 "${LocalizationScriptPath}" "${line}" "${deviceID}" "${did}" "${escapedHeatmapJSON}"`, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing localization script: ${error.stack}`);
      }
      if (stderr) {
        reject(`Script stderr: ${stderr}`);
      }
      resolve(stdout); // Resolve with stdout
    });
  });
};




/* [10]
 * Function to handle validation of the authentication token
 * Endpoint: GET /authenticator/auth-token-validation
*/
exports.handleAuthTokenValidation = async (req, res) => {
  const authHeader = req.headers.authorization;
  const ip = req.ip;
  const deviceID = req.query.device_id;


  // 1. Check missing or malformed Authorization header
  if (!authHeader) {
    logEvent({
      event: 'RE-AUTHENTICATION ATTEMPT WITH AUTH-TOKEN',
      status: 'FAILED ❌',
      cause: 'NO HEADER PROVIDED',
      device_id: deviceID,
      ip,
    });
    return res.status(401).json({ status: 'failed', message: 'Authentication token is missing.' });
  }

  if (!authHeader.startsWith('Bearer ')) {
    logEvent({
      event: 'RE-AUTHENTICATION ATTEMPT WITH AUTH-TOKEN',
      status: 'FAILED ❌',
      cause: 'NO BEARER TOKEN PROVIDED',
      device_id: deviceID,
      ip,
    });
    return res.status(400).json({ status: 'failed', message: "Authentication token is malformed. It should start with 'Bearer '." });
  }

  // If we reach there, it means that the auth header was valid
  const authToken = authHeader.split(' ')[1];

  try {
    const decoded = jwt.decode(authToken, { complete: true });

    // Invalid Token Format
    if (!decoded) {
      logEvent({
        event: 'RE-AUTHENTICATION ATTEMPT WITH AUTH-TOKEN',
        status: 'FAILED ❌',
        cause: 'INVALID TOKEN FORMAT',
        device_id: deviceID,
        ip,
      });
      return res.status(400).json({ status: "failed", message: 'Invalid authentication token format.' });
    }

    const { exp, sub, verifiableCredential } = decoded.payload;
    const did = verifiableCredential?.id;
    const currentTime = Math.floor(Date.now() / 1000);

    // 2. Check if token expired
    if (exp && currentTime > exp) {
      if (did) {
        const device = await findDeviceByDID(did);

        if (device) {
          device.status = 'offline';
          await device.save();

          logEvent({
            event: 'RE-AUTHENTICATION ATTEMPT WITH AUTH-TOKEN',
            status: 'FAILED ❌',
            cause: 'AUTH-TOKEN EXPIRED > DEVICE MARKED AS OFFLINE',
            did,
            device_id: device.device_id,
            ip,
          });
        } else {
          logEvent({
            event: 'RE-AUTHENTICATION ATTEMPT WITH AUTH-TOKEN',
            status: 'FAILED ❌',
            cause: `DEVICE ASSOCIATED WITH DID ${did} NOT FOUND IN DATABASE`,
            device_id: deviceID,
            ip,
          });

          return res.status(404).json({
            status: "failed",
            message: "Device not found."
          });
        }
      }

      return res.status(401).json({
        status: "failed",
        message: 'Authentication token has expired.'
      });
    }

    // 3. Valid token
    if (did) {
      const device = await findDeviceByDID(did);

      logEvent({
        event: 'RE-AUTHENTICATION ATTEMPT WITH AUTH-TOKEN',
        status: 'SUCCESS ✅',
        did,
        device_id: device?.device_id,
        ip,
      });

      return res.status(200).json({
        status: "success",
        message: 'valid',
        did,
        sub,
        verifiableCredential,
      });
    }

    // 4. Device ID not found in payload
    logEvent({
      event: 'RE-AUTHENTICATION ATTEMPT WITH AUTH-TOKEN',
      status: 'FAILED ❌',
      cause: 'DEVICE ID MISSING FROM TOKEN',
      device_id: deviceID,
      ip,
    });

    return res.status(400).json({ status: "failed", message: 'Device ID missing from authentication token.' });

  } catch (err) {
    logEvent({
      event: 'RE-AUTHENTICATION ATTEMPT WITH AUTH-TOKEN',
      status: 'FAILED ❌',
      cause: `ERROR DURING TOKEN VALIDATION: ${err.stack}`,
      device_id: deviceID,
      ip,
    });

    return res.status(500).json({
      status: "failed",
      message: 'Internal server error while validating authentication token.'
    });
  }
};





/* [11]
 * Function to handle device logout and token revocation
 * Endpoint: POST /devices/logout
*/
exports.handleLogout = async (req, res) => {
  try {
    // Extract the auth token and did from the request body
    const { authToken, did: clientDid, deviceID: deviceID } = req.body;

    // Check if the authToken exists
    if (!authToken) {
      return res.status(400).json({
        status: "failed",
        message: 'Missing required authentication token.'
      });
    }

    // Check if the did exists (it is sent from the client)
    if (!clientDid) {
      return res.status(400).json({
        status: "failed",
        message: 'Missing required did.'
      });
    }

    // Check if the did exists (it is sent from the client)
    if (!deviceID) {
      return res.status(400).json({
        status: "failed",
        message: 'Missing required device ID.'
      });
    }

    // Log a message indicating that the device is logging out (with the provided 'did')
    logEvent({
      event: 'LOGOUT ATTEMPT',
      status: 'SUCCESS ✅',
      cause: 'DEVICE ATTEMPTED TO LOG OUT',
      did: clientDid, // Log the provided did
      device_id: deviceID,
      ip: req.ip
    });

    // After successfully logging out, update the device's status to "offline" in the database
    const device = await findDeviceByDeviceID(deviceID);

    if (device) {
      device.status = 'offline';
      await device.save();  // Save the updated device document to mark them as offline
      logEvent({
        event: 'DEVICE STATUS UPDATED',
        status: 'SUCCESS ✅',
        cause: 'DEVICE MARKED AS OFFLINE',
        did: clientDid,
        device_id: deviceID,
        ip: req.ip
      });
    } else {
      logEvent({
        event: 'DEVICE STATUS UPDATE ATTEMPT',
        status: 'FAILED ❌',
        cause: `DEVICE WITH DID ${clientDid} NOT FOUND IN DATABASE`,
        device_id: deviceID,
        did: clientDid,
        ip: req.ip
      });
      return res.status(404).json({
        status: "failed",
        message: "Device not found."
      });
    }

    // Proceed with logout and return a success message
    return res.status(200).json({
      status: "success",
      message: 'Device logged out successfully.'
    });

  } catch (error) {
    // Handle any other errors that occur during the logout process
    logEvent({
      event: 'LOGOUT ATTEMPT',
      status: 'FAILED ❌',
      cause: `AN ERROR OCCURRED DURING DEVICE LOGOUT: ${error.stack}`,
      did: req.body.did, // Log the provided did
      device_id: req.body.deviceID,
      ip: req.ip
    });

    // Return a 200 OK response but indicate failure within the response body
    return res.status(500).json({
      status: "failed",
      message: 'Internal server error while handling logout.'
    });
  }
};


/* [12]
 * Function to handle requests , made to check whether the server is up or not
 * Endpoint: GET /server/status
*/
exports.getServerStatus = (req, res) => {
  res.status(200).json({ status: "success", message: 'DCBA-backend server is up and functional.' });
};


/** [13] 
 * Handles the initiation of a device session by generating a QR scanner state,  
 * creating a session request, and retrieving an authentication QR code.  
 * The QR code is extracted from an external authentication service (tango.io).  
 * * @route   POST /devices/begin-session
 */
exports.beginSession = async (req, res) => {
  try {
    const { device_id, qr_scanner_state_request, log_file_uri } = req.body;
    let savedSessionRequest;

    if (!device_id) {
      return res.status(400).json({ status: "failed", message: 'Device ID is missing, session request failed.' });
    }
    if (!qr_scanner_state_request) {
      return res.status(400).json({ status: "failed", message: 'QR scanner state request is missing, session request failed.' });
    }

    try {
      // // Check if a session request already exists for this device_id
      // const existingSessionRequest = await SESSION_REQUEST.findOne({
      //   device_id: device_id,
      //   qr_scanner_state_request: qr_scanner_state_request
      // });
      
      // if (existingSessionRequest) {
      //   // If found, delete the existing session request
      //   await SESSION_REQUEST.deleteOne({ device_id });
      //   logEvent({
      //     event: 'DELETED EXISTED SESSION REQUEST',
      //     status: 'SUCCESS ✅',
      //     device_id: device_id,
      //     ip: req.ip
      //   });
      // }

      // // Create a new SESSION_REQUEST instance
      // const sessionRequest = new SESSION_REQUEST({
      //   device_id,
      //   qr_scanner_state_request,
      //   log_file_uri
      // });

      // // Save to the database
      // savedSessionRequest = await sessionRequest.save();
      savedSessionRequest = await SESSION_REQUEST.replaceOne(
        { device_id: device_id },
        {
          device_id,
          qr_scanner_state_request,
          log_file_uri,
          timestamp: new Date(),
          // any other required/default fields
        },
        { upsert: true }
      );
      
      logEvent({
        event: 'CREATED NEW SESSION REQUEST',
        status: 'SUCCESS ✅',
        device_id: device_id,
        ip: req.ip
      });
    } catch (error) {
      logEvent({
        event: 'HANDLING SESSION REQUEST',
        status: 'FAILED ❌',
        cause: `AN ERROR OCCURRED DURING HANDLING SESSION REQUEST: ${error.stack}`,
        device_id: device_id,
        ip: req.ip
      });      
      return res.status(500).json({ status: "failed", message: 'Error handling session request.' });
    }

    // Construct the login QR URL with the device_id and other required parameters
    //const loginQRUrl = `https://ips-verifier.tango.io/api/v1/loginQR?state=${qr_scanner_state_request}&client_callback=http%3A%2F%2F${process.env.HOSTNAME_STATIC_IP_CALLBACK_TANGO_VERIFIER}%3A${process.env.SERVER_EXTERNAL_BIND_PORT}%2Fauthenticator%2Fauth-callback&client_id=`;
    const clientCallbackUrl = `https://${process.env.HOSTNAME_DNS_INTRASOFT_DCBA_BACKEND_SERVICE}/development/dcba-backend/authenticator/auth-callback`;
    const loginQRUrl = `https://ips-verifier.k8s-cluster.tango.rid-intrasoft.eu/api/v1/loginQR?state=${qr_scanner_state_request}&client_callback=${encodeURIComponent(clientCallbackUrl)}&client_id=`;
    

    // Define the certificate path
    // const certPath = '/usr/local/share/ca-certificates/ca.crt';
    // let cert;
    // try {
    //   // Read the certificate file from the specified path
    //   cert = fs.readFileSync(certPath);
    // } catch (err) {
    //   logEvent({
    //     event: 'READING CERTIFICATE FILE',
    //     status: 'FAILED ❌',
    //     cause: `AN ERROR OCCURRED DURING READING CERTIFICATE FILE: ${err}`,
    //     device_id: device_id,
    //     ip: req.ip
    //   });
      
    //   return res.status(200).json({ status: "failed", message: 'Error reading the certificate.' });
    // }
    // Create an HTTPS agent with the certificate for secure communication
    const httpsAgent = new https.Agent({
      //ca: cert, // Use the custom CA certificate
      rejectUnauthorized: false // Ensure SSL verification is enabled
    });

    // Fetch the page content from the login QR URL
    const response = await axios.get(loginQRUrl, { httpsAgent });

    // Parse the response HTML using JSDOM
    const dom = new JSDOM(response.data);
    const document = dom.window.document;

    // Locate the <img> tag inside the <main> element (where the QR code is expected to be)
    const imgElement = document.querySelector("main img");

    // Check if the <img> element was found
    if (imgElement) {
      // Extract the QR code image source (assumed to be in base64 format)
      const DEVICE_AUTHENTICATION_QR_CODE = imgElement.getAttribute("src");

      // Send the extracted QR code as a response to the client
      res.status(200).json({
        status: "success",
        message: 'QR Code generated successfully.',
        deviceAuthQRCode: DEVICE_AUTHENTICATION_QR_CODE, // Include the extracted QR code
        sessionRequest: savedSessionRequest
      });
    } else {
      // Log an error message if no QR code image was found
      logEvent({
        event: 'PROCESSING QR CODE BASE64',
        status: 'FAILED ❌',
        cause: `QR CODE NOT FOUND`,
        device_id: device_id,
        ip: req.ip
      });
      res.status(502).json({ status: "failed", message: 'QR code not found in the verifier service response.' });
    }
  } catch (err) {
    // Handle errors, such as network failures or parsing issues
    logEvent({
      event: 'EXTRACTING QR CODE BASE64',
      status: 'FAILED ❌',
      cause: `AN ERROR OCCURRED DURING EXTRACTING QR CODE BASE64: ${err.stack}`,
      device_id: req.body?.device_id || 'UNKNOWN',
      ip: req.ip
    });
    
    res.status(500).json({ status: "failed", message: 'Failed to extract QR code due to an internal server error.' });
  }
};



/** [14]
 * Handle the authentication callback by exchanging the authorization code for an access token.
 * Decodes the received JWT token and processes session requests based on authentication data.
 * @param req - Request object
 * @param res - Response object
 */
exports.handleAuthCallback = async (req, res) => {
  const { code, state } = req.query;
  //console.log(code, state)

  // Check if required parameters (code, state) are missing
  if (!code || !state) {
    return res.status(400).json({
      status: "failed",
      message: 'Missing required parameters: code or state.'
    });
    
  }
 
  //const url = 'https://ips-verifier.tango.io/token';
  const url = `https://ips-verifier.k8s-cluster.tango.rid-intrasoft.eu/token`
  const headers = {
    'accept': 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  // Prepare the request data
  const data = qs.stringify({
    'grant_type': 'authorization_code',
    'code': code,
    //'redirect_uri': `http://${process.env.HOSTNAME_DNS_INTRASOFT_DCBA_BACKEND_SERVICE}:${process.env.SERVER_EXTERNAL_BIND_PORT}/authenticator/auth-callback` // Ensure this matches the web "credential verifier" URL exactly
    redirect_uri: `https://${process.env.HOSTNAME_DNS_INTRASOFT_DCBA_BACKEND_SERVICE}/development/dcba-backend/authenticator/auth-callback`
  });

  // Load the custom CA certificate (ensure the path is correct)
  // const certPath = '/usr/local/share/ca-certificates/ca.crt';
  // let cert;
  // try {
  //   cert = fs.readFileSync(certPath); // Read the certificate file
  // } catch (err) {
  //   logEvent({
  //     event: 'READING CERTIFICATE FILE',
  //     status: 'FAILED ❌',
  //     cause: `AN ERROR OCCURRED DURING READING CERTIFICATE FILE: ${err}`,
  //     ip: req.ip
  //   });
  //   return res.status(200).json({ status: "failed", message: 'Error reading the certificate.' });

  // }

  // Create a custom HTTPS agent with the CA certificate
  const httpsAgent = new https.Agent({
    //ca: cert, // Provide the certificate to verify the server's certificate,
    rejectUnauthorized: false // Ensure SSL verification is enabled
  });

  try {
    // Make the POST request to exchange the authorization code for an access token
    const response = await axios.post(url, data, { headers, httpsAgent });

    // Check if the response contains the access token
    const authToken = response.data.access_token;
    if (!authToken) {
      return res.status(401).json({
        status: "failed",
        message: 'Authentication token not received.'
      });
      
    }

    // Decode the JWT access token to extract information
    const decodedPayload = jwt.decode(authToken, { complete: true });

    // Extract the 'did' and 'sub' from the decoded payload
    const did = decodedPayload.payload?.verifiableCredential?.id; // Ensure optional chaining to prevent errors
    const sub = decodedPayload.payload?.sub;

    if (!did || !sub) {
      return res.status(401).json({
        status: "failed",
        message: 'Invalid authentication token payload.'
      });
      
    }

    // Read the corresponding heatmap file
    const heatmap = await readHeatmapCSVFunction(LocalizationHeatmapPath);

    logEvent({
      event: 'AUTHENTICATION CALLBACK',
      status: 'SUCCESS ✅',
      did: did,
      ip: req.ip
    });

    // Respond to the AUTHENTICATOR via the web socket
    const result = await processSessionRequest(authToken, state, did, sub, heatmap, req);

    // Response with success only if the response is 200(auth-success)
    const ApiResponse = {
      status: result.status === 200 ? "success" : "failed",
      message: result.message
    };

    //console.log(decodedPayload);
    
    if (result.status === 200) {
      ApiResponse.decodedPayload = decodedPayload;
    }
    
    res.status(result.status).json(ApiResponse);
    
  } catch (err) {
    // Catch any errors during the request
    logEvent({
      event: 'AUTHENTICATION CALLBACK',
      status: 'FAILED ❌',
      cause: `AN ERROR OCCURRED DURING AUTHENTICATION CALLBACK: ${err.stack}`,
      ip: req.ip
    });
    
    if (err.response) {
    }
    return res.status(500).json({
      status: "failed",
      message: 'Internal server error. Authentication failed.'
    });
  }
};

/** [15]
 * Fetches the list of devices who are currently online and active.
 * Queries the database for devices with the status 'online' and returns their details such as status, did, and device_id.
 * This route requires a valid JWT authorization token to access.
 * @route   GET /devices/online-shifts
 * @desc    Retrieves a list of devices who are marked as "online" in the database. 
 *          This route requires a valid JWT token for authorization.
 * @access  Private (Requires JWT token)
 * @param   req - Request object
 * @param   res - Response object
 */
exports.fetchOnlineDevices = async (req, res) => {
  try {
    // Fetch online devices and exclude the _id field
    const onlineDevices = await DEVICE.find({ status: 'online' })
      .lean()
      .select('device_id did sub -_id');  // Explicitly exclude _id field

    // Return the response with the filtered data
    return res.status(200).json({
      status: "success",
      message: 'Fetched online devices successfully.',
      data: onlineDevices,
    });
  } catch (error) {
    // Handle any errors
    return res.status(500).json({
      status: "failed",
      message: 'Error fetching online devices.',
    });
  }
};


/** [16]
 * Fetches the list of devices who are currently offline and inactive.
 * Queries the database for devices with the status 'offline' and returns their details such as status, did, and device_id.
 * This route requires a valid JWT authorization token to access.
 * @route   GET /devices/offline-shifts
 * @desc    Retrieves a list of devices who are marked as "offline" in the database. 
 *          This route requires a valid JWT token for authorization.
 * @access  Private (Requires JWT token)
 * @param   req - Request object
 * @param   res - Response object
 */
exports.fetchOfflineDevices = async (req, res) => {
  try {
    // Fetch offline devices and exclude the _id field
    const offlineDevices = await DEVICE.find({ status: 'offline' })
      .lean()
      .select('device_id did sub -_id');  // Explicitly exclude _id field

    // Return the response with the filtered data
    return res.status(200).json({
      status: "success",
      message: 'Fetched offline devices successfully.',
      data: offlineDevices,
    });
  } catch (error) {
    // Handle any errors
    return res.status(500).json({
      status: "failed",
      message: 'Error fetching offline devices.',
    });
  }
};


/** [17]
 * Retrieves the behavioural score of a specific device using its Decentralized Identifier (DID).
 * 
 * @route   POST /devices/behavioural-score
 * @desc    This endpoint receives a request from an external service (e.g., PEP),
 *          validates the input fields (`didSP`, `didRequester`, and `jwtAuth`), verifies the JWT token,
 *          attempts to find the device by its DID, and returns the behavioural score (a float between 0 and 1).
 *          
 *          Handles the following cases:
 *          - Missing required fields → returns 400 Bad Request
 *          - Invalid or expired JWT token → returns 401 Unauthorized
 *          - Device not found → returns 404 Not Found
 *          - Database retrieval errors → returns 500 Internal Server Error
 *          - Successful retrieval → returns 200 OK with the behavioural score
 * 
 * @access  Restricted – Requires a valid `jwtAuth` token in the request body.
 * @param   {Object} req.body - The request payload containing:
 *          - {string} didSP - Service Provider's DID
 *          - {string} didRequester - Device's DID to query
 *          - {string} jwtAuth - JWT token for authentication
 * @param   {Object} res - Express response object used to return the result or an error message.
 */
exports.fetchDeviceBehaviouralScore = async (req, res) => {
  const { didSP, didRequester, jwtAuth } = req.body;

  if (!didSP || !didRequester || !jwtAuth) {
    return res.status(400).json({
      status: "failed",
      message: 'Missing required fields: didSP, didRequester, or jwtAuth.'
    });
  }

  try {
    const decoded = jwt.verify(jwtAuth, process.env.JWT_SECRET_KEY);

    let device;
    try {
      device = await findDeviceByDID(didRequester);
    } catch (dbErr) {
      logEvent({
        event: 'RETRIEVING BEHAVIOURAL SCORE',
        status: 'FAILED ❌',
        did: didRequester,
        device_id: device.device_id,
        cause: `Error retrieving behavioural score: ${dbErr}`
      });
      //console.error('Error retrieving behavioural score:', dbErr);
      return res.status(500).json({
        status: "failed",
        message: "Error retrieving behavioural score."
      });
    }

    if (!device) {
      return res.status(404).json({
        status: "failed",
        message: 'Device not found.'
      });
    }

    logEvent({
      event: 'RETRIEVING BEHAVIOURAL SCORE',
      status: 'SUCCESS ✅',
      did: didRequester,
      device_id: device.device_id,
      cause: 'Successfully retrieved behavioural score.'
    });
    
    return res.status(200).json({
      status: "success",
      message: "Device found.",
      behaviouralScore: device.behavioural_score
    });

  } catch (err) {
    logEvent({
      event: 'JWT VERIFICATION',
      status: 'FAILED ❌',
      did: didRequester,
      cause: `Error while verifying JWT of didSP '${didSP}': ${err.stack}`
    });
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: "failed",
        message: 'Authorization token has expired.'
      });
    }

    return res.status(401).json({
      status: "failed",
      message: 'Invalid authorization token.'
    });
  }
};


/** [18]
 * Retrieves the last known coordinates (latitude and longitude) of a specific device using its Decentralized Identifier (DID).
 * 
 * @route   POST /devices/last-location
 * @desc    This endpoint receives a request from an external service,
 *          validates the input fields (`didSP`, `didRequester`, and `jwtAuth`), verifies the JWT token,
 *          attempts to find the device by its DID, and returns the last known coordinates.
 *          
 *          Handles the following cases:
 *          - Missing required fields → returns 400 Bad Request
 *          - Invalid or expired JWT token → returns 401 Unauthorized
 *          - Device not found → returns 404 Not Found
 *          - Database retrieval errors → returns 500 Internal Server Error
 *          - Successful retrieval → returns 200 OK with the last coordinates
 * 
 * @access  Restricted – Requires a valid `jwtAuth` token in the request body.
 * @param   {Object} req.body - The request payload containing:
 *          - {string} didSP - Service Provider's DID
 *          - {string} didRequester - Device's DID to query
 *          - {string} jwtAuth - JWT token for authentication
 * @param   {Object} res - Express response object used to return the result or an error message.
 */
exports.fetchDeviceLastLocation = async (req, res) => {
  const { didSP, didRequester, jwtAuth } = req.body;

  if (!didSP || !didRequester || !jwtAuth) {
    return res.status(400).json({
      status: "failed",
      message: 'Missing required fields: didSP, didRequester, or jwtAuth.'
    });
  }

  try {
    const decoded = jwt.verify(jwtAuth, process.env.JWT_SECRET_KEY);

    let device;
    try {
      device = await findDeviceByDID(didRequester);
    } catch (dbErr) {
      logEvent({
        event: 'RETRIEVING LAST LOCATION',
        status: 'FAILED ❌',
        did: didRequester,
        device_id: device.device_id,
        cause: `Error retrieving device last location requested from didSP '${didSP}': ${err.stack}`
      });
      
      //console.error('Error retrieving last coordinates:', dbErr);
      return res.status(500).json({
        status: "failed",
        message: "Error retrieving device last location."
      });
    }

    if (!device) {
      return res.status(404).json({
        status: "failed",
        message: 'Device not found.'
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Device found.",
      //lastCoordinates: device.last_coordinates
      lastLocation: device.last_location
    });

  } catch (err) {
    //console.error('JWT verification failed:', err);
    logEvent({
      event: 'JWT VERIFICATION',
      status: 'FAILED ❌',
      did: didRequester,
      cause: `Error while verifying JWT of didSP '${didSP}': ${err.stack}`
    });

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: "failed",
        message: 'Authorization token has expired.'
      });
    }

    return res.status(401).json({
      status: "failed",
      message: 'Invalid authorization token.'
    });
  }
};



/********* BACKEND SERVER EVENT LOGGING MECHANISM *********/
const logEvent = (eventDetails) => {
  // Define unique delimiters for the start and end of each log event
  const logStart = `${magenta}[----------------------- START OF LOG EVENT -----------------------]${reset}\n`;
  const logEnd = `${magenta}[------------------------ END OF LOG EVENT ------------------------]${reset}\n`;

  // Log event details with formatted colors, timestamp, and delimiters
  console.log(
    // Add log start delimiter
    `\n${logStart}` +
    
    // Opening curly brace
    `${green}{${reset}\n` +
    
    // EVENT
    `  ${green}EVENT:${reset} ${yellow}${eventDetails.event || 'UNKNOWN'}${reset},\n` +
    
    // STATUS
    `  ${green}STATUS:${reset} ${yellow}${eventDetails.status || 'UNKNOWN'}${reset},\n` +  
    
    // CAUSE
    `  ${green}CAUSE:${reset} ${yellow}${eventDetails.cause || 'UNKNOWN'}${reset},\n` +  
    
    // did
    `  ${green}DID:${reset} ${yellow}${eventDetails.did || 'UNKNOWN'}${reset},\n` + 
    
    // DEVICE ID
    `  ${green}DEVICE ID:${reset} ${yellow}${eventDetails.device_id || 'UNKNOWN'}${reset},\n` +  
    
    // DEVICE'S IP
    `  ${green}IP DEVICE ADDRESS:${reset} ${yellow}${eventDetails.ip || 'UNKNOWN'}${reset},\n` + 
    
    // TIMESTAMP
    `  ${green}TIMESTAMP:${reset} ${yellow}${moment().format('YYYY-MM-DD HH:mm:ss')}${reset}\n` + 
    
    // Closing curly brace
    `${green}}${reset}` +
    
    // Add log end delimiter
    `\n${logEnd}\n`
  );
};
/********* BACKEND SERVER EVENT LOGGING MECHANISM *********/




















































































