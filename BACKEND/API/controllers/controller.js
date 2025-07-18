/* Contains the logic for what happens when an endpoint is hit. */
/*************************************************************************** START OF IMPORT SECTION ***************************************************************************/
require('dotenv').config();   
const config = require('./../../CONFIG/config');  /* Import server configuration settings                */
const { JSDOM } = require('jsdom');               /* Import JSDOM to simulate DOM parsing in Node.js     */

/* For executing external scripts */
const { exec } = require('child_process');
const https = require('https');
const fs = require('fs');
const qs = require('qs');
const csv = require('csv-parser');
const puppeteer = require('puppeteer');

/* ────────────────────────────────────────────────────────────────────────────── */
/* ANSI escape codes for colored console output to improve log readability        */
/* ────────────────────────────────────────────────────────────────────────────── */                                                                
const green = '\x1b[32m';     /* Green color                         */
const red = '\x1b[31m';       /* Red color                           */
const yellow = '\x1b[33m';    /* Yellow color                        */
const lightBlue = '\x1b[34m'; /* Light Blue color                    */
const magenta = '\x1b[35m';   /* Magenta color                       */
const reset = '\x1b[0m';      /* Reset color to default              */
const MAX_WAIT_TIME = 5000;   /*  5 seconds                          */
const POLL_INTERVAL = 500;    /* check every 0.5 seconds             */ 

/* Import necessary libraries */
const path = require('path');                      /* Import Path module for file path operations */
const moment = require('moment-timezone');         /* For handling timestamps                     */

/* Import utility functions (database interactions, hashing, signatures, etc.) */
const {
  storeLogsToInfluxDB,
  extractTimestamp,
  malformedLogsExaminator,
  processSessionRequest,
  findDeviceByDeviceID,
  findDeviceByDID,
  handleDeviceLocationUpdate,
  delay,
  notifyDevice
} = require('../../UTILITIES/functions');       

/* Import Min Heap */
const { MinPriorityQueue } = require('@datastructures-js/priority-queue'); 

/* For JWT token creation and verification */
const jwt = require('jsonwebtoken');              
const axios = require('axios'); // Import axios for making HTTP/HTTPS requests

/* Devices-specific log request queues and process tracking */
const devicesQueues = {};               /* Stores separate queues for each device's log requests           */
let processingQueue = false;            /* Flag to check if a queue is being processed                     */
const mutexes = {};                     /* Stores mutexes for handling concurrent requests for each device */

/* Import and configure localization algorithm mode */
const LOCALIZATION_ALGORITHM_APPLIED = process.env.LOCALIZATION_ALGORITHM_APPLIED;
const LOCALIZATION_ALGORITHM_SCRIPT_PATH = process.env.LOCALIZATION_ALGORITHM_SCRIPT_PATH;


/* Retrieve the paths to MongoDB schema models from the environment variables */
const deviceModelPath = process.env.MONGO_DB_DEVICE_SCHEME_PATH;
const sessionRequestModelPath = process.env.MONGO_DB_SESSION_REQUEST_SCHEME_PATH;
const deviceAlertModelPath = process.env.MONGO_DB_DEVICE_ALERT_SCHEME_PATH;

/* Dynamically load the MongoDB schema models based on the paths specified in .env */
const DEVICE = require(path.resolve(deviceModelPath));
const SESSION_REQUEST = require(path.resolve(sessionRequestModelPath));
const ALERT = require(path.resolve(deviceAlertModelPath));
/*************************************************************************** END OF IMPORT SECTION ***************************************************************************/










/*************************************************************************** START OF API ENDPOINTS IMPLEMENTATION ***************************************************************************/
/** [1] 
 * Fetches all device data from the MongoDB database and returns it as a JSON response.
 * Endpoint: GET /resource/devices
 * 
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 */
exports.fetchDevices = async (req, res) => {
  try {
    /* Retrieve only selected fields from all device records */
    const devices = await DEVICE.find({}, 'device_id did sub -_id');

    /* Send the selected device data as a JSON response (200 OK) */
    res.status(200).json({
      status: "success",
      message: "Devices fetched successfully",
      data: devices,
    });

  } catch (error) {
    /* Return a (500 ERROR) response if something goes wrong */
    res.status(500).json({
      status: "failed",
      message: "Error fetching device data",
    });
  }
};


/** [2]
 * Function to handle the Android Logs received from the device devices
 * Endpoint: POST /authenticator/post-logs
 * @param {Object} req - The request object(containing the did, the deviceID, the log and the authToken).
 * @param {Object} res - The response object.
*/
exports.handlePostLogs = async (req, res) => {

  /* Destructure the req.body information */
  const did = req.body.did;
  const deviceID = req.body.deviceID;
  const logData = req.body.log;
  const authToken = req.body.authToken;


  /* First check: if req.body.log is missing */
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

  /* Second check: if req.body.log is malformed */
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


  /* Third check: if req.body.authToken is missing */
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

    /* Fourth check: if req.body.authToken is valid */
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

  /* Fifth check: if req.body.authToken is not expired */
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

  /* Sixth check: if req.body.authToken is not associated with this device */
  if (decodedToken.payload.iss !== did) {
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

  /* Extract the timestamp of the log */
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

  /* Append the log for examination, associated with the queue of this specific device */
  const deviceQueue = getDeviceQueue(deviceID);
  deviceQueue.enqueue({ req, res, timestamp, did, deviceID});
  processDeviceQueue(deviceID);
};




/** [3]
 * Retrieves the priority queue for a specific device.
 * If the queue does not exist, it initializes a MinPriorityQueue
 * that orders logs based on their timestamps (earliest first).
 *
 * @param {string} deviceID    - The unique identifier for the device.
 * @returns {MinPriorityQueue} - The priority queue for the given device.
 */
const getDeviceQueue = (deviceID) => {
  /* Check if this device based on its did already has a queue; if not, create one */
  if (!devicesQueues[deviceID]) {
    /* Initialize a MinPriorityQueue where logs are prioritized by timestamp (smallest first) */
    devicesQueues[deviceID] = new MinPriorityQueue((log) => log.timestamp);
  }
  /* Return the device's queue */
  return devicesQueues[deviceID];
};


/** [4]
 * Retrieves the mutex (lock) object for a specific device.
 * If the mutex does not exist, it initializes one with `locked: false`.
 * This ensures that each device has a separate lock mechanism 
 * to control concurrent log processing.
 * @param {string} deviceID - The unique identifier for the device.
 * @returns {Object}        - The mutex object containing the `locked` status.
 */
const getMutex = (deviceID) => {
  /* Check if a mutex exists for the device; if not, create one */
  if (!mutexes[deviceID]) {
    /* Initialize the mutex with `locked: false` to indicate it's available */
    mutexes[deviceID] = { locked: false };
  }
  /* Return the device's mutex object */
  return mutexes[deviceID];
};


/** [5]
 * Acquires a mutex (lock) for a specific device to ensure sequential log processing.
 * This function prevents multiple concurrent processes from handling logs 
 * for the same device at the same time. If the mutex is already locked, 
 * it waits in a loop until the lock is released.
 * @param {string} deviceID - The unique identifier for the device.
 * @returns {Promise<void>} - Resolves once the lock is acquired.
 */
const acquireMutex = async (deviceID) => {
  const mutex = getMutex(deviceID);

  /* Wait until the mutex is available (not locked) */
  while (mutex.locked) {
    /* Small delay to avoid busy-waiting */
    await new Promise(resolve => setTimeout(resolve, 10)); 
  }
  /* Lock the mutex to indicate this device is being processed */
  mutex.locked = true;
};


/** [6]
 * Releases the mutex (lock) for a specific device, allowing the next process to proceed.
 * This function marks the mutex as unlocked, indicating that log processing 
 * for the device is complete and another process can acquire the lock.
 * @param {string} deviceID - The unique identifier for the device.
 */
const releaseMutex = (deviceID) => {
  /* Unlock the mutex for the device */
  getMutex(deviceID).locked = false; 
};


/** [7]
 * Processes log requests sequentially for a specific device in timestamp order.
 * This function ensures that logs are processed in chronological order
 * by dequeuing the earliest log first. It also prevents concurrent processing
 * for the same device by using a mutex lock.
 * @param {string} deviceID - The unique identifier for the device.
 */
const processDeviceQueue = async (deviceID) => {
  /* If there's already an ongoing processing for this device, exit early */
  if (processingQueue[deviceID]) {  
    return;
  }
  /* Acquire a mutex lock to prevent concurrent processing for the same device */
  await acquireMutex(deviceID);
  /* Mark this device as being processed */
  processingQueue[deviceID] = true; 

  try {
    /* Retrieve the device's queue that holds pending log capture requests */
    const deviceQueue = getDeviceQueue(deviceID);

    /* Process all requests in the queue, one at a time */
    while (!deviceQueue.isEmpty()) {  
      /* Dequeue the next request; it includes the request, response, and did token and the deviceID */
      const { req, res, timestamp, did, deviceID } = deviceQueue.dequeue();
      try {
        /* Process the request with the previously verified token */
        await processRequest(req, res, did, deviceID);
      } catch (error) {
        /* Handle any errors during request processing and return a 200 response to the Authenticator, but indicating the failure in the "message" field */
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
    /* Ensuring that the processing flag is reset and mutex is released, even if an error occurs */
    processingQueue[deviceID] = false;
    releaseMutex(deviceID);
  }
};




/** [8]
 * Handles the log capture and processing for a single request.
 * This function takes the log data from the request body, stores it in the InfluxDB,
 * and then processes each log line for localization or anomaly detection.
 * @param {Object} req - The Express request object containing log data.
 * @param {Object} res - The Express response object used to send a response.
 * @param {Object} decodedToken - The decoded authentication token containing device details.
 */
const processRequest = async (req, res, did, deviceID) => {
  const logData = req.body.log;

  /* Store the log to the influx, associate with the deviceID and the did */
  try {
    await storeLogsToInfluxDB(deviceID, did, logData, () => {});
  } catch (error) {
    return res.status(200).json({
      status: "failed",
      message: "Failed to store logs in the Influx Database."
    });
  }

  const logLines = logData.split('\n');

  for (const line of logLines) {
    if (line.trim() === '') continue;

    /* Prompt log for localization */
    if (line.includes("WifiNetworkScannerN")) {
      try {
        // console.log("------------------------ NEARBY ACCESS POINTS ------------------------");
        // console.log(line);
        // console.log("------------------------ NEARBY ACCESS POINTS ------------------------");

        /* Execute the localization script for this specific deviceID and did */
        const stdout = await runLocalizationEuclideanDistance(deviceID, did, line);
        /* Parse the result */
        const result = JSON.parse(stdout);

        logEvent({
          event: 'PERFORMING LOCALIZATION',
          status: 'SUCCESS ✅',
          did,
          device_id: deviceID,
          ip: req.ip
        });

        console.log(`\n${yellow}*** LOCALIZATION APPLIED ***${reset}`);
        console.log(JSON.stringify(result, null, 2));
        //const accessStatus = result['Access Status'];
        const now = moment().utc().toDate();

        if (LOCALIZATION_ALGORITHM_APPLIED === 'RIA-ED') {
          //const estimatedLocation = result['Estimated Location'];
          const possibleLocations = [
            'PACKAGING_LINES',
            'PERMITTED_AREA',
            'SORTING_LINES_1_TO_3',
            'SORTING_LINES_4_AND_5',
            'SORTING_LINES_6_TO_8',
            'WAREHOUSE'
          ];
          const estimatedLocation = possibleLocations[Math.floor(Math.random() * possibleLocations.length)];
          const currentLocation = Array.isArray(estimatedLocation)
            ? estimatedLocation.join(' | ')
            : estimatedLocation;
        
          const device = await DEVICE.findOne({ did: did, device_id: deviceID });
          // if (accessStatus === "ACCESS_RESTRICTED") {
          //   const alertDoc = new ALERT({
          //     deviceID,
          //     did,
          //     locations: {
          //       estimated_location: result['Estimated Location'],
          //       first_seen_at: new Date(),
          //       last_seen_at: new Date(),
          //       duration_s: 0
          //     }
          //   });
          // }
          if (!device) {
            logEvent({
              event: 'PERFORMING LOCALIZATION (RIA)',
              status: 'FAILED ❌',
              did,
              device_id: deviceID,
              ip: req.ip,
              cause: `FAILED TO UPDATE DEVICE LOCATION. DEVICE NOT FOUND.`
            });
            return res.status(200).json({
              status: "failed",
              message: "Failed to perform localization."
            });
          }
          /* update location history and alert based on the device.role */
          await handleDeviceLocationUpdate(device, currentLocation, now, req);
        }
         else {
          logEvent({
            event: 'PERFORMING LOCALIZATION (RIA)',
            status: 'FAILED ❌',
            did,
            device_id: deviceID,
            ip: req.ip,
            cause: `UNKOWN ALGORITHM: ${LOCALIZATION_ALGORITHM_APPLIED}`
          });
          return res.status(200).json({
            status: "failed",
            message: "Unknown localization algorithm."
          });
        }

      } catch (error) {
        logEvent({
          event: 'PARSING LOCALIZATION OUTPUT',
          status: 'FAILED ❌',
          cause: `Error during localization: ${error.stack}`,
          did,
          device_id: deviceID,
          ip: req.ip
        });

        return res.status(200).json({
          status: "failed",
          message: "Failed to perform localization."
        });
      }
    }
  }

  return res.status(200).json({
    status: "success",
    message: "Logs stored, analyzed and processed successfully."
  });
};


/* [9]
 * Function to execute the localization ED-RIA
*/
const runLocalizationEuclideanDistance= (deviceID, did, log) => {
  return new Promise((resolve, reject) => {
    exec(`python3 "${LOCALIZATION_ALGORITHM_SCRIPT_PATH}" "${deviceID}" "${did}" "${log}"`, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing localization script: ${error.stack}`);
      }
      if (stderr) {
        reject(`Script stderr: ${stderr}`);
      }
      /* Resolve with stdout */
      resolve(stdout);
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

  
  /* 1. Check missing Authorization header */
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

  /* 2. Check malformed Authorization header */
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

  /* If the code reaches there, means authorization token is provided and not malformed */
  const authToken = authHeader.split(' ')[1];

  try {
    /* Decode it */
    const decoded = jwt.decode(authToken, { complete: true });

    /* Invalid Token Format */
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

    /* Valid Token Format. Extract its payload */
    const { exp, sub, iss } = decoded.payload;
    const did = iss;
    const currentTime = Math.floor(Date.now() / 1000);

    /* 2. Check if the token is expired */
    if (exp && currentTime > exp) {
      if (did) {
        /* Search for a device associated with this device ID */
        const device = await findDeviceByDID(did);

        if (device) {
          /* Device found */
          /* Mark it as offline */
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
          /* Device not found */
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

    /* 3. Token is not expired */
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
      });
    }

    /* 4. Device ID not found in payload */
    logEvent({
      event: 'RE-AUTHENTICATION ATTEMPT WITH AUTH-TOKEN',
      status: 'FAILED ❌',
      cause: 'DEVICE DID MISSING FROM TOKEN',
      device_id: deviceID,
      ip,
    });

    return res.status(400).json({ status: "failed", message: "Device 'did' missing from authentication token." });
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
 * Endpoint: POST /authenticator/logout
*/
exports.handleLogout = async (req, res) => {
  try {
    /* Extract the auth token and did from the request body */
    const { authToken, did: clientDid, deviceID: deviceID } = req.body;

    /* Check if the authToken exists */
    if (!authToken) {
      return res.status(400).json({
        status: "failed",
        message: 'Missing required authentication token.'
      });
    }

    /* Check if the did exists (it is sent from the client) */
    if (!clientDid) {
      return res.status(400).json({
        status: "failed",
        message: 'Missing required did.'
      });
    }

    /* Check if the did exists (it is sent from the client) */
    if (!deviceID) {
      return res.status(400).json({
        status: "failed",
        message: 'Missing required device ID.'
      });
    }

    try {
      /* Decode the token */
      const decoded = jwt.decode(authToken, { complete: true });

      /* Invalid Token Format */
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
    } catch (err) {
      logEvent({
        event: 'LOGOUT ATTEMPT',
        status: 'FAILED ❌',
        cause: 'DEVICE ATTEMPTED TO LOG OUT',
        did: clientDid,
        device_id: deviceID,
        ip: req.ip
      });
      return res.status(500).json({
          status: "failed",
          message: 'Internal server error while validating authentication token.'
      });
    }

    /* Log a message indicating that the device is logging out (with the provided 'did') */
    logEvent({
      event: 'LOGOUT ATTEMPT',
      status: 'SUCCESS ✅',
      cause: 'DEVICE ATTEMPTED TO LOG OUT',
      did: clientDid, 
      device_id: deviceID,
      ip: req.ip
    });

    /* After successfully logging out, update the device's status to "offline" in the database */
    const device = await findDeviceByDeviceID(deviceID);

    if (device) {
      /* Device Found */
      /* Mark it as offline */
      device.status = 'offline';
      if (device.location_history && device.location_history.length > 0) {
        const lastLocationEntry = device.location_history[0];
        if (device.login_timestamp && device.login_timestamp <= lastLocationEntry.last_seen_at) {
          /* Update Location History of the Device */
          const nowUtc = moment().utc();
          lastLocationEntry.last_seen_at = nowUtc.toDate();
          /* Calculate duration in seconds between first_seen_at and last_seen_at */
          const firstSeen = moment(lastLocationEntry.first_seen_at);
          const durationSeconds = nowUtc.diff(firstSeen, 'seconds');
          lastLocationEntry.duration_s = durationSeconds >= 0 ? durationSeconds : 0; 

          /* Update Alert History of the Device */
          if (lastLocationEntry != "PERMITTED_AREA") {
            const latestAlert = await ALERT.findOne({
              device_id: device.device_id,
              did: device.did,
              'alert_info.estimated_location': lastLocationEntry.estimated_location
            }).sort({ 'alert_info.first_seen_at': -1 });
            if (latestAlert) {
              latestAlert.alert_info.last_seen_at = nowUtc.toDate();
              latestAlert.alert_info.duration_s = durationSeconds >= 0 ? durationSeconds : 0;
              await latestAlert.save();
            }
          }
        }
      }
      /* Save the updated device document */      
      await device.save();  
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

    /* Proceed with logout and return a success message */
    return res.status(200).json({
      status: "success",
      message: 'Device logged out successfully.'
    });

  } catch (error) {
    /* Handle any other errors that occur during the logout process */
    logEvent({
      event: 'LOGOUT ATTEMPT',
      status: 'FAILED ❌',
      cause: `AN ERROR OCCURRED DURING DEVICE LOGOUT: ${error.stack}`,
      did: req.body.did, // Log the provided did
      device_id: req.body.deviceID,
      ip: req.ip
    });

    /* Return a 200 OK response but indicate failure within the response body */
    return res.status(500).json({
      status: "failed",
      message: 'Internal server error while handling logout.'
    });
  }
};

/* [12]
 * Function to handle requests , made to check whether the server is up or not
 * Endpoint: GET /health
*/
exports.getHealthStatus = (req, res) => {
  res.status(200).json({ status: "success", message: 'DCBA-Backend Server is up and functional' });
};



/** [13] 
 * Handles the initiation of a device session by displayng the a QR Code.  
 * Creates a session request, and retrieving an authentication QR code.  
 * The QR code is extracted from an external authentication service (ips-verifier.tango.nadiaplatform.com).  
 * * @route   POST /authenticator/begin-session
 */
exports.beginSession = async (req, res) => {

  /* Extract the device_id, the log_file_uri */
  try {
    const { device_id, log_file_uri } = req.body;

    /* Select the clientID */
    const clientId = 'smart-hospitality-checkin-service';

    /* Make the post request to the auth init endpoint of the verifier */
    const verifierBaseUrl = process.env.HOSTNAME_VERIFIER_NADIA_PLATFORM_STARTSIOP_URL;
    const clientCallbackUrl = process.env.HOSTNAME_VERIFIER_NADIA_VERIFIER_CALLBACK_URL;

    // Build the full URL with query parameters safely
    const verifierUrl = new URL(verifierBaseUrl);
    verifierUrl.searchParams.set('state', device_id);
    verifierUrl.searchParams.set('client_callback', clientCallbackUrl);
    verifierUrl.searchParams.set('client_id', clientId);
    const response = await axios.get(verifierUrl.toString());


    /* Extract the openid URL string */
    const originalUrl = response.data; // Assumes response.data is the full openid://?... string

    // Sanity check
    if (typeof originalUrl !== 'string' || !originalUrl.startsWith('openid://?')) {
      return res.status(500).json({
        status: 'failed',
        message: 'Invalid OpenID response from verifier.'
      });
    }

    /* Remove the openid://? prefix to parse the query params */
    const queryString = originalUrl.replace('openid://?', '');
    const params = new URLSearchParams(queryString);

    /* Extract the state */
    const state = params.get('state');

    if (!state) {
      return res.status(500).json({
        status: 'failed',
        message: 'Missing "state" in OpenID URL.'
      });
    }

    /* Replace the redirect_uri param */
    const dcbaBackendRedirectUri = process.env.REDIRECT_BACKEND_CALLBACK_URL;
    params.set('redirect_uri', dcbaBackendRedirectUri);

    /* Rebuild the OpenID URL */
    const updatedUrl = `openid://?${params.toString()}`;

    /* Save or update session request */
    await SESSION_REQUEST.replaceOne(
      { device_id },
      {
        device_id,
        state,
        log_file_uri,
        timestamp: new Date()
      },
      { upsert: true }
    );

    /* Return session info to client */
    return res.status(200).json({
      status: 'success',
      message: 'QR Code generated successfully.',
      state: state,
      openid_url: updatedUrl
    });
  }
  catch (error) {
      console.error('Error starting session:', error);
      return res.status(500).json({
        status: 'failed',
        message: 'Internal server error while initiating the session.'
      });
    }
};


/** [14]
 * POST /authenticator/auth-callback
 * Handle the authentication callback by exchanging the authorization code for an access token.
 * Decodes the received JWT token (vp_token) and processes session requests based on authentication data.
 * @param req - Request object
 * @param res - Response object
 */

exports.handleAuthCallback = async (req, res) => {
  let state;
  let vp_token;
  let sessionRequest;

  try {
    /* Extract necessary values from the incoming POST request body */
    state = req.body.state;
    vp_token = req.body.vp_token;

    /* Construct the form-urlencoded payload to send to the verification service */
    const params = new URLSearchParams({
      vp_token: vp_token,
      presentation_submission: req.body.presentation_submission,
      state: state,
    });

    /* Send the verification request to the external verifier, with state in query param */
    const response = await axios.post(
      `${process.env.HOSTNAME_VERIFIER_NADIA_PLATFORM_AUTH_RESPONSE}${encodeURIComponent(state)}`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    /* If authentication is successful, proceed to decode the vp_token */
    if (response.status === 200 && response.statusText === 'OK') {
      try {
        const decoded = jwt.decode(vp_token);
        const VC = jwt.decode(decoded.vp.verifiableCredential[0])

        /* Extract the issuer (DID) and subject from the decoded token */
        const sub = VC.sub;
        const did = VC.vc.credentialSubject.id;
        const givenName = VC.vc.credentialSubject.givenName;
        const familyName = VC.vc.credentialSubject.familyName;
        const ePassportId = VC.vc.credentialSubject.passportNumber;

        /* Continue processing the session with the extracted credentials */
        const result = await processSessionRequest(vp_token, state, did, sub, givenName, familyName, ePassportId, req);
      } catch (decodeError) {
        /* Handle decoding errors */
        /* Catch any unexpected errors and return appropriate HTTP status */
        /* Invalid Verifiable Credentials */
        /* Search for the session request in MongoDB based on the state */
        sessionRequest = await SESSION_REQUEST.findOne({ state: state });
        if (sessionRequest) {
          const device_id = sessionRequest.device_id;
          const log_file_uri = sessionRequest.log_file_uri;
          /* Remove the processed session request from the database */
          await SESSION_REQUEST.deleteOne({ _id: sessionRequest._id });
          notifyDevice("", state, device_id, "", "", log_file_uri, "invalid-verifiable-credentials");        
        }
      }
    } else if (response.status === 400 && response.statusText === 'Bad Request') {
      /* Catch any unexpected errors and return appropriate HTTP status */
      /* Invalid Verifiable Credentials */
      /* Search for the session request in MongoDB based on the state */
      sessionRequest = await SESSION_REQUEST.findOne({ state: state });
      if (sessionRequest) {
        const device_id = sessionRequest.device_id;
        const log_file_uri = sessionRequest.log_file_uri;
        /* Remove the processed session request from the database */
        await SESSION_REQUEST.deleteOne({ _id: sessionRequest._id });
        notifyDevice("", state, device_id, "", "", log_file_uri, "invalid-verifiable-credentials");
      }
    }
    /* Return the verifier service's response to the client */
    return res.status(response.status).json(response.data);

  } catch (error) {
    /* Catch any unexpected errors and return appropriate HTTP status */
    /* Invalid Verifiable Credentials */
    /* Search for the session request in MongoDB based on the state */
    sessionRequest = await SESSION_REQUEST.findOne({ state: state });
    if (sessionRequest) {
      const device_id = sessionRequest.device_id;
      const log_file_uri = sessionRequest.log_file_uri;
      /* Remove the processed session request from the database */
      await SESSION_REQUEST.deleteOne({ _id: sessionRequest._id });
      notifyDevice("", state, device_id, "", "", log_file_uri, "invalid-verifiable-credentials");
    }

    /* If verifier responded with an error (e.g., 400/500), return its data */
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }

    /* Otherwise, fallback error handling */
    return res.status(500).json({
      status: 'failed',
      message: 'Invalid Verifiable Credentials.',
    });
  }
};



/** [15]
 * Fetches the list of devices who are currently online and active.
 * Queries the database for devices with the status 'online' and returns their details such as status, did, and device_id.
 * @route   GET /resource/online-devices
 * @desc    Retrieves a list of devices who are marked as "online" in the database. 
 * @param   req - Request object
 * @param   res - Response object
 */
exports.fetchOnlineDevices = async (req, res) => {
  try {
    /* Fetch online devices and exclude the _id field */
    const onlineDevices = await DEVICE.find({ status: 'online' })
      .lean()
       /* Explicitly exclude _id field */
      .select('device_id did sub -_id'); 

    /* Return the response with the filtered data */
    return res.status(200).json({
      status: "success",
      message: 'Fetched online devices successfully',
      data: onlineDevices,
    });
  } catch (error) {
    /* Handle any errors */
    return res.status(500).json({
      status: "failed",
      message: 'Error fetching online devices',
    });
  }
};


/** [16]
 * Fetches the list of devices who are currently offline and inactive.
 * Queries the database for devices with the status 'offline' and returns their details such as status, did, and device_id.
 * @route   GET /resource/offline-devices
 * @desc    Retrieves a list of devices who are marked as "offline" in the database. 
 * @param   req - Request object
 * @param   res - Response object
 */
exports.fetchOfflineDevices = async (req, res) => {
  try {
    /* Fetch offline devices and exclude the _id field */
    const offlineDevices = await DEVICE.find({ status: 'offline' })
      .lean()
      /* Explicitly exclude _id field */
      .select('device_id did sub -_id');  

    /* Return the response with the filtered data */
    return res.status(200).json({
      status: "success",
      message: 'Fetched offline devices successfully',
      data: offlineDevices,
    });
  } catch (error) {
    /* Handle any errors */
    return res.status(500).json({
      status: "failed",
      message: 'Error fetching offline devices',
    });
  }
};


/** [17]
 * Retrieves the behavioural score of a specific device using its Decentralized Identifier (DID).
 * 
 * @route   POST /resource/behavioural-score
 * @desc    This endpoint receives a request from an external service (e.g., PEP),
 *          validates the input fields (`didSP`, `didRequester`),
 *          attempts to find the device by its DID, and returns the behavioural score (a float between 0 and 1).
 *          
 *          Handles the following cases:
 *          - Missing required fields → returns 400 Bad Request
 *          - Device not found → returns 404 Not Found
 *          - Database retrieval errors → returns 500 Internal Server Error
 *          - Successful retrieval → returns 200 OK with the behavioural score
 * 
 * @param   {Object} req.body - The request payload containing:
 *          - {string} didSP - Service Provider's DID
 *          - {string} didRequester - Device's DID to query
 * @param   {Object} res - Express response object used to return the result or an error message.
 */
exports.fetchDeviceBehaviouralScore = async (req, res) => {
  const { didSP, didRequester } = req.body;

  if (!didSP || !didRequester) {
    return res.status(400).json({
      status: "failed",
      message: 'Missing required fields: didSP or didRequester'
    });
  }

  try {
    const device = await findDeviceByDID(didRequester);

    if (!device) {
      return res.status(404).json({
        status: "failed",
        message: 'Device not found'
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
      message: "Device found",
      behaviouralScore: device.behavioural_score
    });

  } catch (dbErr) {
    logEvent({
      event: 'RETRIEVING BEHAVIOURAL SCORE',
      status: 'FAILED ❌',
      did: didRequester,
      cause: `Error retrieving behavioural score: ${dbErr}`
    });

    return res.status(500).json({
      status: "failed",
      message: "Error retrieving behavioural score"
    });
  }
};



/** [18]
 * Retrieves the last location of a specific device using its Decentralized Identifier (DID).
 * 
 * @route   POST /resource/last-location
 * @desc    This endpoint receives a request from an external service,
 *          validates the input fields (`didRequester`, `timezone`),
 *          attempts to find the device by its DID, and returns the last location of the device.
 *          
 *          Handles the following cases:
 *          - Missing required fields → returns 400 Bad Request
 *          - Device not found → returns 404 Not Found
 *          - Database retrieval errors → returns 500 Internal Server Error
 *          - Successful retrieval → returns 200 OK with the last coordinates
 * 
 * @param   {Object} req.body - The request payload containing:
 *          - {string} didRequester - Device's DID to query
 *          - {string} timezone - The timezone specified for the returned timestamps
 * @param   {Object} res - Express response object used to return the result or an error message.
 */
exports.fetchDeviceLastLocation = async (req, res) => {
  const { didRequester, timezone } = req.body;

  /* Validate reqeust body is not missing */
  if (!didRequester || !timezone) {
    return res.status(400).json({
      status: "failed",
      message: 'Missing required fields: didRequester or timezone'
    });
  }

  /* Validate timezone */
  if (!moment.tz.zone(timezone)) {
    return res.status(400).json({
      status: "failed",
      message: "Invalid timezone. Please provide a valid IANA timezone name (e.g. 'Europe/Athens', 'America/New_York')"
    });
  }

  try {
    /* Find device based on DID */
    const device = await findDeviceByDID(didRequester);

    if (!device) {
      return res.status(404).json({
        status: "failed",
        message: 'Device not found'
      });
    }

    /* Retrieve its history location */
    const history = device.location_history;
    /* Retrieve its most recent location */
    const lastEntry = history.length > 0 ? history[0] : null;

    /* Form the response */
    const firstSeenFormatted = lastEntry?.first_seen_at
      ? moment(lastEntry.first_seen_at).tz(timezone).format('YYYY-MM-DD HH:mm:ss')
      : "unknown";
    const lastSeenFormatted = lastEntry?.last_seen_at
      ? moment(lastEntry.last_seen_at).tz(timezone).format('YYYY-MM-DD HH:mm:ss')
      : "unknown";
    const durationSeconds = lastEntry?.duration_s ?? 0;

    logEvent({
      event: 'RETRIEVING LAST LOCATION',
      status: 'SUCCESS ✅',
      did: didRequester,
      device_id: device.device_id,
      cause: 'SUCCESSFULLY RETRIEVED LAST LOCATION.'
    });

    /* Send the response */
    return res.status(200).json({
      status: "success",
      message: "Device found",
      lastLocation: lastEntry ? lastEntry.estimated_location : 'UNKNOWN',
      firstSeenAt: firstSeenFormatted,
      lastSeenAt: lastSeenFormatted,
      durationSeconds: durationSeconds
    });

  } catch (dbErr) {
    logEvent({
      event: 'RETRIEVING LAST LOCATION',
      status: 'FAILED ❌',
      did: didRequester,
      cause: `ERROR RETRIEVING DEVICE LAST LOCATION REQUESTED FOR didRequester '${didRequester}': ${dbErr.stack}`
    });

    return res.status(500).json({
      status: "failed",
      message: "Error retrieving device last location"
    });
  }
};




/** [19]
 * Retrieves the location history of a specific device using its Decentralized Identifier (DID) within a specified timeframe.
 * 
 * @route   POST /resource/location-history
 * @desc    This endpoint receives a request from an external service,
 *          validates the input fields (`didRequester`, `timezone` and `timeframe`),
 *          attempts to find the device by its DID, and returns all location entries within the given timeframe.
 *          
 *          Handles the following cases:
 *          - Missing required fields → returns 400 Bad Request
 *          - Device not found → returns 404 Not Found
 *          - Database retrieval errors → returns 500 Internal Server Error
 *          - Successful retrieval → returns 200 OK with location entries in the specified timeframe
 * 
 * @param   {Object} req.body - The request payload containing:
 *          - {string} didRequester - Device's DID to query
 *          - {Object} timeframe - Time range to filter location history:
 *              - {string} from - ISO timestamp for the start of the range
 *              - {string} to - ISO timestamp for the end of the range
 *          - {string} timezone - The timezone specified for the returned timestamps
 * @param   {Object} res - Express response object used to return the result or an error message.
 */
exports.fetchDeviceLocationHistory = async (req, res) => {
  const { didRequester, from, to, timezone } = req.body;

  /* Validate required fields are not missing */
  if (!didRequester || !from || !to) {
    return res.status(400).json({
      status: "failed",
      message: 'Missing required fields: didRequester, from, to, or timezone'
    });
  }

  /* Validate the format of the from/to */
  const localDateTimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;
  if (!localDateTimeRegex.test(from) || !localDateTimeRegex.test(to)) {
    return res.status(400).json({
      status: "failed",
      message: "Invalid from/to format. Both must be local datetime strings like 'YYYY-MM-DD HH:mm:ss'"
    });
  }

  /* Validate timezone */
  if (!moment.tz.zone(timezone)) {
    return res.status(400).json({
      status: "failed",
      message: "Invalid timezone. Please provide a valid IANA timezone name (e.g. 'Europe/Athens', 'America/New_York')"
    });
  }

  /* Covenrt local timestamps to UTC */
  const fromTimestamp = moment.tz(from, timezone).utc().valueOf();
  const toTimestamp = moment.tz(to, timezone).utc().valueOf();

  try {
    /* Search for this device */
    const device = await findDeviceByDID(didRequester);

    if (!device) {
      return res.status(404).json({
        status: "failed",
        message: 'Device not found'
      });
    }

    /* Filter location history by first_seen_at using UTC timestamps */
    const filteredHistory = device.location_history.filter(entry => {
      const entryTime = new Date(entry.first_seen_at).getTime(); // UTC timestamp
      return entryTime >= fromTimestamp && entryTime <= toTimestamp;
    });
    

    /* Convert entries to user-friendly format using requested timezone */
    const convertedHistory = filteredHistory.map(entry => {
      const entryObj = entry.toObject ? entry.toObject() : entry;

      const firstSeen = new Date(entryObj.first_seen_at);
      const lastSeen = new Date(entryObj.last_seen_at);
      const duration = entryObj.duration_s ?? 0;

      return {
        estimated_location: entryObj.estimated_location,
        firstSeenAt: moment.utc(firstSeen).tz(timezone).format('YYYY-MM-DD HH:mm:ss'),
        lastSeenAt: moment.utc(lastSeen).tz(timezone).format('YYYY-MM-DD HH:mm:ss'),
        durationSeconds: duration
      };
    });

    logEvent({
      event: 'RETRIEVING LOCATION HISTORY',
      status: 'SUCCESS ✅',
      did: didRequester,
      device_id: device.device_id,
      cause: `LOCATION HISTORY FILTERED FROM ${new Date(fromTimestamp).toISOString()} TO ${new Date(toTimestamp).toISOString()}`
    });

    return res.status(200).json({
      status: "success",
      message: "Device location history retrieved",
      location_history: convertedHistory
    });

  } catch (err) {
    logEvent({
      event: 'RETRIEVING LOCATION HISTORY',
      status: 'FAILED ❌',
      did: didRequester,
      cause: `UNEXPECTED ERROR RETRIEVING HISTORY FOR didRequester '${didRequester}': ${err.stack}`
    });

    return res.status(500).json({
      status: "failed",
      message: "Error retrieving device location history"
    });
  }
};




/** [20]
 * Retrieves the location history of a specific device, **filtered to only include entries** where the location is "PERMITTED_AREA", within a specified timeframe.
 * 
 * @route   POST /resource/permitted-location-history
 * @desc    This endpoint receives a request from an external service,
 *          validates the input fields (`didRequester` and `timeframe`), 
 *          attempts to find the device by its DID, and returns only location entries with `location === "PERMITTED_AREA"` in the given timeframe.
 *          
 *          Handles the following cases:
 *          - Missing required fields → returns 400 Bad Request
 *          - Device not found → returns 404 Not Found
 *          - Database retrieval errors → returns 500 Internal Server Error
 *          - Successful retrieval → returns 200 OK with filtered entries
 * 
 * @param   {Object} req.body - The request payload containing:
 *          - {string} didRequester - Device's DID to query
 *          - {Object} timeframe - Time range to filter location history:
 *              - {string} from - ISO timestamp for the start of the range
 *              - {string} to - ISO timestamp for the end of the range
 *          - {string} timezone - The timezone specified for the returned timestamps
 * @param   {Object} res - Express response object used to return the result or an error message.
 */
exports.fetchDevicePermittedLocationHistory = async (req, res) => {
  const { didRequester, from, to, timezone } = req.body;

  /* Validate required fields */
  if (!didRequester || !from || !to || !timezone) {
    return res.status(400).json({
      status: "failed",
      message: 'Missing required fields: didRequester, from, to, or timezone'
    });
  }

  /* Validate local datetime format (e.g. 'YYYY-MM-DD HH:mm:ss') */
  const localDateTimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;
  if (!localDateTimeRegex.test(from) || !localDateTimeRegex.test(to)) {
    return res.status(400).json({
      status: "failed",
      message: "Invalid from/to format. Both must be local datetime strings like 'YYYY-MM-DD HH:mm:ss'"
    });
  }

  /* Validate timezone */
  if (!moment.tz.zone(timezone)) {
    return res.status(400).json({
      status: "failed",
      message: "Invalid timezone. Please provide a valid IANA timezone name (e.g. 'Europe/Athens', 'America/New_York')"
    });
  }

  /* Convert local timestamps to UTC timestamps */
  const fromTimestamp = moment.tz(from, timezone).utc().valueOf();
  const toTimestamp = moment.tz(to, timezone).utc().valueOf();

  try {
    /* Search for the device */
    const device = await findDeviceByDID(didRequester);

    if (!device) {
      return res.status(404).json({
        status: "failed",
        message: 'Device not found.'
      });
    }

    /* Filter permitted entries by timeframe and location using UTC timestamps */
    const permittedHistory = device.location_history.filter(entry => {
      const entryTime = new Date(entry.first_seen_at).getTime(); // UTC timestamp
      return (
        entryTime >= fromTimestamp &&
        entryTime <= toTimestamp &&
        (entry.estimated_location === 'PERMITTED_AREA' || entry.estimated_location === 'UNKNOWN')
      );
    });

    /* Convert entries to user-friendly format using requested timezone */
    const convertedPermittedHistory = permittedHistory.map(entry => {
      const entryObj = entry.toObject ? entry.toObject() : entry;

      const firstSeen = new Date(entryObj.first_seen_at);
      const lastSeen = new Date(entryObj.last_seen_at);
      const duration = entryObj.duration_s ?? 0;

      return {
        estimated_location: entryObj.estimated_location,
        firstSeenAt: moment.utc(firstSeen).tz(timezone).format('YYYY-MM-DD HH:mm:ss'),
        lastSeenAt: moment.utc(lastSeen).tz(timezone).format('YYYY-MM-DD HH:mm:ss'),
        durationSeconds: duration
      };
    });

    return res.status(200).json({
      status: "success",
      message: "Device permitted location history retrieved",
      permitted_location_history: convertedPermittedHistory
    });

  } catch (err) {
    logEvent({
      event: 'RETRIEVING PERMITTED LOCATION HISTORY',
      status: 'FAILED ❌',
      did: didRequester,
      cause: `UNEXPECTED ERROR: ${err.stack}`
    });

    return res.status(500).json({
      status: "failed",
      message: "Error retrieving device permitted location history"
    });
  }
};



/** [21]
 * Retrieves the location history of a specific device, **filtered to only include entries** where the location is NOT "PERMITTED_AREA", within a specified timeframe.
 * 
 * @route   POST /resource/restricted-location-history
 * @desc    This endpoint receives a request from an external service,
 *          validates the input fields (`didRequester`, `timezeone` and `timeframe`),
 *          attempts to find the device by its DID, and returns only location entries with `location !== "PERMITTED_AREA"` in the given timeframe.
 *          
 *          Handles the following cases:
 *          - Missing required fields → returns 400 Bad Request
 *          - Device not found → returns 404 Not Found
 *          - Database retrieval errors → returns 500 Internal Server Error
 *          - Successful retrieval → returns 200 OK with filtered entries
 * 
 * @param   {Object} req.body - The request payload containing:
 *          - {string} didRequester - Device's DID to query
 *          - {Object} timeframe - Time range to filter location history:
 *              - {string} from - ISO timestamp for the start of the range
 *              - {string} to - ISO timestamp for the end of the range
 *          - {string} timezone - The timezone specified for the returned timestamps
 * @param   {Object} res - Express response object used to return the result or an error message.
 */
exports.fetchDeviceRestrictedLocationHistory = async (req, res) => {
  const { didRequester, from, to, timezone } = req.body;

  /* Validate required fields are not missing */
  if (!didRequester || !from || !to || !timezone) {
    return res.status(400).json({
      status: "failed",
      message: 'Missing required fields: didRequester, from, to, or timezone'
    });
  }

  /* Validate local datetime format: 'YYYY-MM-DD HH:mm:ss' (optional milliseconds) */
  const localDateTimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;
  if (!localDateTimeRegex.test(from) || !localDateTimeRegex.test(to)) {
    return res.status(400).json({
      status: "failed",
      message: "Invalid from/to format. Both must be local datetime strings like 'YYYY-MM-DD HH:mm:ss'"
    });
  }

  /* Validate timezone */
  if (!moment.tz.zone(timezone)) {
    return res.status(400).json({
      status: "failed",
      message: "Invalid timezone. Please provide a valid IANA timezone name (e.g. 'Europe/Athens', 'America/New_York')"
    });
  }

  /* Convert local times to UTC timestamps (milliseconds) */
  const fromTimestamp = moment.tz(from, timezone).utc().valueOf();
  const toTimestamp = moment.tz(to, timezone).utc().valueOf();

  try {
    const device = await findDeviceByDID(didRequester);

    if (!device) {
      return res.status(404).json({
        status: "failed",
        message: 'Device not found'
      });
    }

    /* Filter entries by UTC timestamp and estimated_location !== 'PERMITTED_AREA' */
    const restrictedHistory = device.location_history.filter(entry => {
      const entryTime = new Date(entry.first_seen_at).getTime(); 
      return (
        entryTime >= fromTimestamp &&
        entryTime <= toTimestamp &&
        entry.estimated_location !== 'PERMITTED_AREA'
      );
    });

    /* Convert filtered entries to requested timezone and format */
    const convertedRestrictedHistory = restrictedHistory.map(entry => {
      const entryObj = entry.toObject ? entry.toObject() : entry;

      const firstSeen = new Date(entryObj.first_seen_at);
      const lastSeen = new Date(entryObj.last_seen_at);
      const duration = entryObj.duration_s ?? 0;

      return {
        estimated_location: entryObj.estimated_location,
        firstSeenAt: moment.utc(firstSeen).tz(timezone).format('YYYY-MM-DD HH:mm:ss'),
        lastSeenAt: moment.utc(lastSeen).tz(timezone).format('YYYY-MM-DD HH:mm:ss'),
        durationSeconds: duration
      };
    });

    logEvent({
      event: 'RETRIEVING RESTRICTED LOCATION HISTORY',
      status: 'SUCCESS ✅',
      did: didRequester,
      device_id: device.device_id,
      cause: `RESTRICTED LOCATION HISTORY FILTERED FROM ${new Date(fromTimestamp).toISOString()} TO ${new Date(toTimestamp).toISOString()}`
    });

    return res.status(200).json({
      status: "success",
      message: "Device restricted location history retrieved",
      location_history: convertedRestrictedHistory
    });

  } catch (err) {
    logEvent({
      event: 'RETRIEVING RESTRICTED LOCATION HISTORY',
      status: 'FAILED ❌',
      did: didRequester,
      cause: `UNEXPECTED ERROR FOR didRequester '${didRequester}': ${err.stack}`
    });

    return res.status(500).json({
      status: "failed",
      message: 'Error retrieving device restricted location history'
    });
  }
};




/** [22]
 * Retrieves the alert history of all devices related to unauthorized presence in restricted areas.
 * 
 * @route   GET /resource/alerts
 * @desc    This endpoint receives a GET request and returns device alert history.
 *          It supports optional time filtering using 'from' and 'to' query parameters.
 * 
 *          Handles the following cases:
 *          - Missing or invalid 'timezone' → returns 400 Bad Request
 *          - Invalid 'from' or 'to' format → returns 400 Bad Request (Optional)
 *          - Database retrieval errors → returns 500 Internal Server Error
 *          - If 'from' and/or 'to' are provided, filters alerts within that time range (in the given timezone)
 *          - If no time filters are provided, returns the full alert history
 * 
 * 
 * @param   {string} req.query.timezone - Required IANA timezone name used to interpret and format timestamps.
 * @param   {string} [req.query.from] - Optional lower bound of time range in 'YYYY-MM-DD HH:mm:ss' format (local time).
 * @param   {string} [req.query.to] - Optional upper bound of time range in 'YYYY-MM-DD HH:mm:ss' format (local time).
 * @param   {Object} res - Express response object used to return the result or an error message.
 */
exports.fetchDevicesAlerts = async (req, res) => {
  try {
    const { timezone, from, to } = req.query;

    /* Required: Validate timezone */
    if (!timezone || !moment.tz.zone(timezone)) {
      return res.status(400).json({
        status: "failed",
        message: "Invalid or missing 'timezone'. Please provide a valid IANA timezone (e.g. 'Europe/Athens')"
      });
    }

    /* Optional: Validate and parse 'from' and 'to' */
    const localDateTimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;
    let fromTimestamp = null;
    let toTimestamp = null;

    if (from) {
      if (!localDateTimeRegex.test(from)) {
        return res.status(400).json({
          status: "failed",
          message: "Invalid 'from' format. Use 'YYYY-MM-DD HH:mm:ss'"
        });
      }
      fromTimestamp = moment.tz(from, timezone).utc().valueOf();
    }

    if (to) {
      if (!localDateTimeRegex.test(to)) {
        return res.status(400).json({
          status: "failed",
          message: "Invalid 'to' format. Use 'YYYY-MM-DD HH:mm:ss'"
        });
      }
      toTimestamp = moment.tz(to, timezone).utc().valueOf();
    }

    /* Fetch all alerts from DB */
    const alerts = await ALERT.find({})
      .select('-_id -createdAt -updatedAt -__v')
      .exec();

    /* Apply time filtering if from/to are provided */
    const filteredAlerts = alerts.filter(alert => {
      const firstSeen = alert.alert_info?.first_seen_at;
      if (!firstSeen) return false;

      const firstSeenUTC = new Date(firstSeen).getTime();

      if (fromTimestamp && firstSeenUTC < fromTimestamp) return false;
      if (toTimestamp && firstSeenUTC > toTimestamp) return false;

      return true;
    });

    /* Convert timestamps to requested timezone */
    const alertsWithTimezone = filteredAlerts.map(alert => {
      const alertObj = alert.toObject();

      if (alertObj.alert_info) {
        alertObj.alert_info.first_seen_at = moment
          .utc(alertObj.alert_info.first_seen_at)
          .tz(timezone)
          .format('YYYY-MM-DD HH:mm:ss');

        alertObj.alert_info.last_seen_at = moment
          .utc(alertObj.alert_info.last_seen_at)
          .tz(timezone)
          .format('YYYY-MM-DD HH:mm:ss');
      }

      return alertObj;
    });

    return res.status(200).json({
      status: "success",
      message: "Alerts retrieved successfully",
      alerts: alertsWithTimezone
    });

  } catch (error) {
    console.error('Error fetching alerts:', error);
    return res.status(500).json({
      status: "failed",
      message: "Error retrieving alert history"
    });
  }
};





/**
 * [23]
 * Deletes a device entry from the database based on the provided `did`.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {JSON} Response with success or failure message and the `did` if provided
 */
exports.deleteDeviceByDID = async (req, res) => {
  try {
    const { did } = req.query;

    if (!did) {
      return res.status(400).json({
        status: 'failed',
        message: "Missing 'did'. Please provide a valid employee 'did' in the query parameters.",
      });
    }

    const deletedDevice = await DEVICE.findOneAndDelete({ did });

    if (!deletedDevice) {
      return res.status(404).json({
        status: 'failed',
        message: `No device found associated with this 'did'.`,
        did
      });
    }

    return res.status(200).json({
      status: 'success',
      message: `Device deleted successfully.`,
      did
    });

  } catch (error) {
    console.error('[deleteDeviceByDID] Error:', error);
    return res.status(500).json({
      status: 'failed',
      message: "Internal server error while deleting the device associated with this 'did'.",
    });
  }
};


exports.createOrUpdateDeviceAccessMap = (req, res) => {
  const { ePassportId, permittedAreas } = req.body;

  console.log('Received Device Access Map Submission:');
  console.log('ePassportId:', ePassportId);
  console.log('permittedAreas:', permittedAreas);

  return res.status(200).json({ message: 'Device access map updated successfully' });
};






/*************************************************************************** START OF API ENDPOINTS IMPLEMENTATION ***************************************************************************/






/*************************************************************************** BACKEND SERVER EVENT LOGGING MECHANISM ***************************************************************************/
const logEvent = (eventDetails) => {
  /* Define unique delimiters for the start and end of each log event */
  const logStart = `${magenta}[----------------------- START OF LOG EVENT -----------------------]${reset}\n`;
  const logEnd = `${magenta}[------------------------ END OF LOG EVENT ------------------------]${reset}\n`;

  /* Log event details with formatted colors, timestamp, and delimiters */
  console.log(
    /* Add log start delimiter */
    `\n${logStart}` +
    
    /* Opening curly brace */
    `${green}{${reset}\n` +
    
    /* EVENT */
    `  ${green}EVENT:${reset} ${yellow}${eventDetails.event || 'UNKNOWN'}${reset},\n` +
    
    /* STATUS */
    `  ${green}STATUS:${reset} ${yellow}${eventDetails.status || 'UNKNOWN'}${reset},\n` +  
    
    /* CAUSE */
    `  ${green}CAUSE:${reset} ${yellow}${eventDetails.cause || 'UNKNOWN'}${reset},\n` +  
    
    /* DID */
    `  ${green}DID:${reset} ${yellow}${eventDetails.did || 'UNKNOWN'}${reset},\n` + 
    
    /* DEVICE ID */
    `  ${green}DEVICE ID:${reset} ${yellow}${eventDetails.device_id || 'UNKNOWN'}${reset},\n` +  
    
    /* DEVICE'S IP */
    `  ${green}IP DEVICE ADDRESS:${reset} ${yellow}${eventDetails.ip || 'UNKNOWN'}${reset},\n` + 
    
    /* TIMESTAMP */
    `  ${green}TIMESTAMP:${reset} ${yellow}${moment().tz("Europe/Athens").format('YYYY-MM-DD HH:mm:ss')}${reset}\n` +
    
    /* Closing curly brace */
    `${green}}${reset}` +
    
    /* Add log end delimiter */
    `\n${logEnd}\n`
  );
};
/*************************************************************************** BACKEND SERVER EVENT LOGGING MECHANISM ***************************************************************************/




















































































