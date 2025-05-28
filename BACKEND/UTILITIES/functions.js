/* 
 * Utility module that provides various helper functions such as 
 * reading/writing files, password encryption, cryptographic operations, 
 * database interactions. 
 */
    
require("dotenv").config();         // Load environment variables from the .env file

const fs = require('fs');           // File System module for handling file operations
const bcrypt = require('bcrypt');   // Library for securely hashing and verifying passwords
const crypto = require('crypto');   // Cryptography module for secure hashing, signing, and encryption tasks
const { InfluxDB, Point } = require('@influxdata/influxdb-client');  // InfluxDB Client for logging and storing time-series data
const csv = require('csv-parser');  // CSV parser module for reading and processing .csv files
const path = require('path');       // Path module for handling and resolving file paths
const WebSocket = require('ws');
//const moment = require('moment');
const moment = require('moment-timezone');

// ──────────────────────────────────────────────────────────────────────────────
// Import the MongoDB schema models dynamically using paths from environment variables
// ──────────────────────────────────────────────────────────────────────────────

// Retrieve the paths to MongoDB schema models from the environment variables
const deviceModelPath = process.env.MONGO_DB_DEVICE_SCHEME_PATH;
const sessionRequestModelPath = process.env.MONGO_DB_SESSION_REQUEST_SCHEME_PATH;

// Dynamically load the MongoDB schema models based on the paths specified in .env
const DEVICE = require(path.resolve(deviceModelPath));
const SESSION_REQUEST = require(path.resolve(sessionRequestModelPath));
const WSS_CONNECTIONS_FROM_QR_SCANNER_REQUESTS = new Map(); // returns the wss connections associated with their qr_state_requests

// ──────────────────────────────────────────────────────────────────────────────
// ANSI escape codes for colored console output to improve log readability
// ──────────────────────────────────────────────────────────────────────────────                                                                  
const green = '\x1b[32m';     /* Green color                         */
const red = '\x1b[31m';       /* Red color                           */
const yellow = '\x1b[33m';    /* Yellow color                        */
const lightBlue = '\x1b[34m'; /* Light Blue color                    */
const magenta = '\x1b[35m';   /* Magenta color                       */
const reset = '\x1b[0m';      /* Reset color to default              */

/************************************************************************************************************************************************************************************************/


/** [1]
 * Retrieves the URI of a device based on its DID.
 * This function queries the "DEVICE" collection to find the devices's details.
 *
 * @param {string} did - The DID (Decentralized Identifier) of the device which URI is to be retrieved.
 * @returns {Promise<{uriContent: string} | null>} - A promise that resolves to an object containing the URI if found, otherwise null.
 */
const getDeviceURI = async (did) => {
  try {
    // Attempt to retrieve the device's details from the database using the 'findDeviceByDID' function
    const device = await findDeviceByDID(did);

    // If an device record is found, return an object containing the URI. Otherwise, return null.
    return device ? { uriContent: device.URI } : null;
  } catch (error) {
    // Log any errors that occur during the process
    logEvent({
      event: 'RETRIEVING DEVICE URI',
      status: 'FAILED ❌',
      did: did,
      cause: `AN ERROR OCCURRED WHILE RETRIEVING THE DEVICE URI: ${error.stack}`
    });
    
    return null;
  }
};





/** [2]
 * Creates a new device record and stores the device's details in the MongoDB database.
 * Each device is uniquely identified by their DID (Decentralized Identifier) and is associated 
 * with a sub claim, a device ID for authentication, and other relevant details.
 *
 * @param {string} did - The Decentralized Identifier (DID) uniquely identifying the device.
 * @param {string} sub - The sub claim associated with the device, used for authentication.
 * @param {string} device_id - The device ID associated with the device.
 * @returns {Promise<void>} - A promise that resolves once the device has been successfully stored to the database.
 */
const createDeviceDocument = async (did, sub, device_id, log_file_uri) => {
  try {

    // Create initial location entry
    const initialLocation = {
      location: 'PERMITTED_AREA',
      timestamp: new Date()
    };
  
    // Create a new device document with the provided attributes
    const newDevice = new DEVICE({
      did,                // device's unique DID
      sub,                // Sub claim used for authentication
      device_id,          // Device ID associated with the device
      log_file_uri,
      status: 'online',   // Set the status as 'online' by default, since the accounts are registered dynamically during their first active session
      location_history: [initialLocation],
    });

    // Save the new device record to the MongoDB database
    await newDevice.save();

    // Log success message upon successful addition of the device
    logEvent({
      event: 'DEVICE REGISTERED TO THE DATABASE',
      status: 'SUCCESS ✅',
      did: did,
      device_id: device_id
    });

  } catch (error) {
    // Log any errors encountered during the process
    logEvent({
      event: 'DEVICE REGISTERED TO THE DATABASE',
      status: 'FAILED ❌',
      did: did,
      device_id: device_id,
      cause: `AN ERROR OCCURRED DURING DEVICE REGISTRATION TO THE DATABASE: ${error.stack}`
    });
  }
};





/** [3]
 * Finds a device in the MongoDB database by their DID (Decentralized Identifier).
 * This function queries the "DEVICE" collection to retrieve a device document 
 * that matches the provided DID.
 *
 * @param {string} did - The DID of the device to be searched.
 * @returns {Promise<Object|null>} - Returns the device document if found, otherwise returns `null`.
 * @throws {Error} - Throws an error if the database query fails.
 */
const findDeviceByDID = async (did) => {
  try {
    // Query the "DEVICE" collection to find a device by the specified DID
    const device = await DEVICE.findOne({ did: did });

    if (!device) {
      // Log a message if the device does not exist in the database
      logEvent({
        event: 'SEARCH FOR DEVICE',
        status: 'FAILED ❌',
        did: did,
        cause: `DEVICE ASSOCIATED WITH DID ${did} NOT FOUND`
      });
      return null;
    }

    
    logEvent({
      event: 'SEARCH FOR DEVICE',
      status: 'SUCCESS ✅',
      did: did,
      cause: `DEVICE ASSOCIATED WITH DID ${did} FOUND`,
      device_id: device.device_id
    });
    // Return the device document if found
    return device;
  } catch (error) {
    // Log any errors encountered during the database query
    logEvent({
      event: 'SEARCH FOR DEVICE',
      status: 'FAILED ❌',
      did: did,
      cause: `AN ERROR OCCURRED DURING DEVICE SEARCH IN THE DATABASE: ${error.stack}`
    });
    

    // Throw an error indicating the failure of the database query
    throw new Error('Database query failed');
  }
};




/** [4]
 * Stores the device logs to the InfluxDB database.
 * Logs are stored in the specified bucket, tagged by the DID (Decentralized Identifier).
 * This function allows logging device actions and provides an optional callback after storage.
 *
 * @param {string} did - The DID (Decentralized Identifier) associated with the log.
 * @param {string} log - The log message to be stored in the database.
 * @param {Function} [onComplete] - Optional callback function that executes once the log is stored.
 */
async function storeLogsToInfluxDB(device_id, did, log, onComplete) {


  try {
    // Initialize InfluxDB client using credentials from environment variables
    const influxDB = new InfluxDB({
      url: process.env.INFLUX_DB_URI,
      token: process.env.INFLUX_INITDB_AUTH_TOKEN
    });

    // Create a write API instance for the specified organization and bucket
    const writeApi = influxDB.getWriteApi(
      process.env.INFLUX_INITDB_ORG,
      process.env.INFLUX_INITDB_BUCKET,
      'ns' // Write precision in nanoseconds
    );

    // Create a new data point for InfluxDB
    const point = new Point('ANDROID_LOGS_MEASUREMENT')
      .tag('device_id', device_id)     // Tag the data point by device's ID
      .stringField('LOG_MESSAGE', log) // Store the log message as a string field
      .timestamp(new Date());          // Use the extracted timestamp for the data point

    // Write the point to InfluxDB
    writeApi.writePoint(point);
    
    // Ensure the data is flushed and written to the database
    await writeApi.flush();
    await writeApi.close(); // Properly close the write API to ensure the data is written

    logEvent({
      event: '📥 ANDROID LOG STORED TO INFLUX DATABASE',
      status: 'SUCCESS ✅',
      device_id: device_id,
      did: did,
      cause: 'DEVICE DEVICE UPLOADING LOGS -- ACTIVE SESSION'
    });

    // Invoke the callback if provided
    if (onComplete) onComplete();
  } catch (error) {
    logEvent({
      event: '📥 ANDROID LOG STORED TO INFLUX DATABASE',
      status: 'FAILED ❌',
      did: did,
      device_id: device_id,
      cause: `AN ERROR OCCURRED WHILE STORING THE ANDROID LOG TO THE INFLUXDB DATABASE: ${error.stack}`
    });

    // Ensure the callback is invoked even in case of error to prevent blocking execution
    if (onComplete) onComplete();
  }
}




/** [5]
 * Extracts the timestamp from a log string.
 * 
 * @param {string} log - The log string containing a timestamp.
 * @returns {string|null} - The extracted timestamp in "MM-DD HH:mm:ss.SSS" format or null if not found.
 */
function extractTimestamp(log) {
  // Regular expression to match timestamp format: MM-DD HH:mm:ss.SSS
  const timestampRegex = /(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/;
  const match = log.match(timestampRegex);
  
  return match ? match[1] : null; // Return timestamp or null if not found
}


/** [6]
 * Examines a log string to determine if it follows the expected format.
 * 
 * Expected format: "MM-DD HH:mm:ss.SSS PID TID LEVEL TAG: MESSAGE"
 * 
 * @param {string} log - The log string to validate.
 * @returns {boolean} - Returns `true` if the log is valid, otherwise `false`.
 */
function malformedLogsExaminator(log) {
  // Regular expression for expected log format
  const logRegex = /^(\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([DIWE])\s+([\w\d]+):\s+(.*)$/;

  const match = log.match(logRegex);
  if (!match) return false; // Log does not match expected format

  // Extracted log components
  const [ , date, time, pid, tid, level, tag, message ] = match;

  // Validate process ID (PID) and thread ID (TID)
  if (isNaN(Number(pid)) || isNaN(Number(tid))) return false;

  // Validate log level (should be one of D, I, W, E)
  const validLevels = new Set(["D", "I", "W", "E"]);
  if (!validLevels.has(level)) return false;

  // Validate tag (should be at least 2 characters)
  if (!tag || tag.length < 2) return false;

  // Validate message (should not be empty or just spaces)
  if (!message || message.trim().length === 0) return false;

  return true; // Log is valid
}




/** [10]
 * Handles the session request lookup and notification process.
 * This function searches for a session request in the database using the provided qr state(state), 
 * notifies the relevant device, and creates a new device record if necessary.
 *
 * @param {string} qr_scanner_state_request - The qr_scanner_state_request
 * @param {string} did - The DID (unique identifier) associated with the device.
 * @param {string} sub - The subject identifier associated with the device.
 * @returns {Promise<void>} - Resolves once the session request is processed and necessary actions are taken.
 */
async function processSessionRequest(authToken, qr_scanner_state_request, did, sub, req) {

  try {
    // Search for the session request in MongoDB based on the state
    const sessionRequest = await SESSION_REQUEST.findOne({ qr_scanner_state_request: qr_scanner_state_request });

    if (sessionRequest) {
      const device_id = sessionRequest.device_id;
      const log_file_uri = sessionRequest.log_file_uri;

      // Remove the processed session request from the database
      await SESSION_REQUEST.deleteOne({ _id: sessionRequest._id });

      logEvent({
        event: 'PROCESSING SESSION REQUEST',
        cause: 'NOTIFIED DEVICE AND DELETED THEIR SESSION REQUEST FROM THE DATABASE',
        status: 'SUCCESS ✅',
        did: did,
        device_id: device_id,
        ip: req.ip
      });

      // Look for the device in the DEVICE collection using the findDeviceByDeviceID function
      const existingDevice = await findDeviceByDeviceID(device_id);

      if (!existingDevice) {
        // Device not found 
        // Search in the Mongo for a device with this did
        const deviceWithSameDID = await findDeviceByDID(did);
        if (!deviceWithSameDID) {
          // If no device found associated with this DID, create it
          await createDeviceDocument(did, sub, device_id, log_file_uri);
          notifyDevice(authToken, qr_scanner_state_request, device_id, did, sub, log_file_uri, "session-request-valid");
          logEvent({
            event: 'DEVICE STATUS UPDATED',
            status: 'SUCCESS ✅',
            cause: 'DEVICE MARKED AS ONLINE',
            did: did,
            device_id: device_id,
            ip: req.ip
          });
          return { status: 200, message: "Authentication success. Device status updated to online." };
        } else {
          // Someone tried to log in from his/her device, using an existing DID
          notifyDevice(authToken, qr_scanner_state_request, device_id, did, sub, log_file_uri, "potential-credential-sharing");
          logEvent({
            event: 'UNAUTHORIZED ATTEMPT FROM USING CREDENTIALS FROM ANOTHER DEVICE',
            status: 'FAILED ❌',
            did: did,
            device_id: device_id,
            ip: req.ip
          });
          return { status: 401, message: "Credentials don't match this device." };
        }
      } else {
        // This device already exists. Need to ensure that its did matches the did request
        if (existingDevice.did === did) {
          // The device associated with this did already exists
          // 1. Check if the device is already online
          if (existingDevice.status === 'offline') {
            existingDevice.status = 'online';
            await existingDevice.save();  // Save the updated device document
            logEvent({
              event: 'DEVICE ALREADY REGISTERED IN THE DATABASE',
              status: 'SUCCESS ✅',
              did: did,
              device_id: device_id,
              ip: req.ip
            });
            notifyDevice(authToken, qr_scanner_state_request, device_id, did, sub, log_file_uri, "session-request-valid");
            logEvent({
              event: 'DEVICE STATUS UPDATED',
              status: 'SUCCESS ✅',
              cause: 'DEVICE MARKED AS ONLINE',
              did: did,
              device_id: device_id,
              ip: req.ip
            });
            return { status: 200, message: "Authentication success. Device status updated to online." };
          } else {
            // The specific device is already online
            logEvent({
              event: 'DEVICE ALREADY ONLINE',
              status: 'FAILED ❌',
              did: did,
              device_id: device_id,
              ip: req.ip
            });
            notifyDevice(authToken, qr_scanner_state_request, device_id, did, sub, log_file_uri, "device-already-online");
            return { status: 409, message: "Device already online." };
          }
          
        } else {
          // Someone tried to log in to their device using another employee's credentials
          notifyDevice(authToken, qr_scanner_state_request, device_id, did, sub, log_file_uri, "potential-credential-sharing");
          logEvent({
            event: 'UNAUTHORIZED ATTEMPT USING CREDENTIALS FROM ANOTHER DEVICE',
            status: 'FAILED ❌',
            did: did,
            device_id: device_id,
            ip: req.ip
          });
          return { status: 401, message: "Credentials don't match this device." };
        }
      }
    } else {
      // Notify the device that the session request is expired, in order to re-generate a new unique QR
      notifyDevice(authToken, qr_scanner_state_request, "unknown", did, sub, "unknown", "session-request-expired");
      logEvent({
        event: 'SEARCH FOR SESSION REQUEST FOR DEVICE',
        status: 'FAILED ❌',
        did: did,
        cause: 'THE SESSION REQUEST HAS EXPIRED',
        ip: req.ip
      });
      return { status: 410, message: "Session request expired." };
    }
  } catch (error) {
    // Handle any errors that occur during the session request processing
    logEvent({
      event: 'PROCESSING SESSION REQUEST',
      status: 'FAILED ❌',
      did: did,
      cause: `AN ERROR OCCURRED DURING THE PROCESSING OF THE SESSION REQUEST: ${error.stack}`,
      ip: req.ip

    });    
    return { status: 500, message: "Internal server error. Authentication failed." };
  }
}



/** [11]
 * Initializes a WebSocket server and handles client connections.
 * The function listens for WebSocket connections, associates qr_scanner_state_request with their WebSocket instances,
 * and manages disconnections.
 * 
 * @param {Object} wss - The WebSocket server instance to initialize.
 */
function initializeWebSocketServer(wss) {
  try {
    // When a new WebSocket connection is established
    wss.on('connection', (ws, req) => {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);  // Split to get the query part after "?"
      const qr_scanner_state_request = urlParams.get('qr_scanner_state_request');
      const device_id = urlParams.get('device_id'); // Extract device_id

      // Handle device connections
      if (qr_scanner_state_request && device_id) {
        WSS_CONNECTIONS_FROM_QR_SCANNER_REQUESTS.set(qr_scanner_state_request, ws);
        logEvent({
          event: `DEVICE WITH QR STATE "${qr_scanner_state_request}" CONNECTED VIA WEBSOCKET`,
          status: 'SUCCESS ✅',
          cause: 'INITIATING SESSION',
          device_id: device_id
        });
      }

      // Handle WebSocket messages from both device devices
      ws.on('message', (message) => {
        console.log(`Received message:`, message);
      });

      // Handle WebSocket disconnection for both devices
      ws.on('close', () => {
        if (qr_scanner_state_request && device_id) {
          WSS_CONNECTIONS_FROM_QR_SCANNER_REQUESTS.delete(qr_scanner_state_request);
          logEvent({
            event: `DEVICE WITH QR STATE "${qr_scanner_state_request}" DISCONNECTED FROM WEBSOCKET`,
            status: 'SUCCESS ✅',
            cause: 'SESSION INITIATED',
            device_id: device_id
          });
        }
      });
    });

    logEvent({
      event: `WEBSOCKET SERVER INITIALIZED SUCCESSFULLY AT ${moment().tz("Europe/Athens").format('YYYY-MM-DD HH:mm:ss')}`,
      status: 'SUCCESS ✅',
    });

  } catch (error) {
    // If an error occurs during initialization, log the error message
    logEvent({
      event: `WEBSOCKET SERVER FAILED TO INITIALIZE AT ${moment().tz("Europe/Athens").format('YYYY-MM-DD HH:mm:ss')}`,
      status: 'FAILED ❌',
    });
  }
}



/** [12]
 * Notifies a specific client (device) via WebSocket when certain events occur.
 * This function checks if the WebSocket connection for the given device_id is open,
 * and if so, sends the message with the relevant data.
 * 
 * @param {string} qr_scanner_state_request - The current state of the session (e.g., 'auth_success').
 * @param {string} device_id - The device identifier.
 * @param {string} did - The Decentralized Identifier (DID) associated with the device.
 * @param {string} sub - Subscription or other relevant information.
 * @param {string} message - Based on this message, the Authenticator app decides which alert to display.
 */
function notifyDevice(authToken, qr_scanner_state_request, device_id, did, sub, log_file_uri, message) {
  // Retrieve the WebSocket connection associated with the device_id
  const ws_connection_associated_with_qr_scanner_state_request = WSS_CONNECTIONS_FROM_QR_SCANNER_REQUESTS.get(qr_scanner_state_request);

  // Check if the device's WebSocket connection exists and is open
  if (ws_connection_associated_with_qr_scanner_state_request && ws_connection_associated_with_qr_scanner_state_request.readyState === WebSocket.OPEN) {
    // Prepare the data to be sent to the device
    if (message === "session-request-expired") {
      const data = {
        status: "auth-failed",                                          // Status message indicating the result (e.g., 'auth_success')
        qr_scanner_state_request: qr_scanner_state_request,             // The current state (e.g., 'authenticated', 'pending')
        device_id: device_id,                                           // The device ID
        did: did,                                                       // The Decentralized Identifier (DID) associated with the device
        sub: sub,                                                       // The subscription or other relevant information
        logFileURI: log_file_uri,
        authToken: authToken,
        message: message                                                // message: session-request-expired
      };
  
      // Send the data to the device as a JSON string
      ws_connection_associated_with_qr_scanner_state_request.send(JSON.stringify(data));
  
      logEvent({
        event: `NOTIFIED DEVICE WITH QR STATE "${qr_scanner_state_request}"`,
        status: 'SUCCESS ✅',
        cause: 'SESSION REQUEST EXPIRED',
        device_id: device_id,
        did: did,
      });
    } else if (message === "session-request-valid") {
      const data = {
        status: "auth-success",                                         // Status message indicating the result (e.g., 'auth_success')
        qr_scanner_state_request: qr_scanner_state_request,             // The current state (e.g., 'authenticated', 'pending')
        device_id: device_id,                                           // The device ID
        did: did,                                                       // The Decentralized Identifier (DID) associated with the device
        sub: sub,                                                       // The subscription or other relevant information
        logFileURI: log_file_uri,
        authToken: authToken,
        message: message                                                // message: session-request-valid
      };
  
      // Send the data to the device as a JSON string
      ws_connection_associated_with_qr_scanner_state_request.send(JSON.stringify(data));
      logEvent({
        event: `NOTIFIED DEVICE WITH QR STATE "${qr_scanner_state_request}"`,
        status: 'SUCCESS ✅',
        cause: 'DEVICE AUTHENTICATED',
        device_id: device_id,
        did: did,
      });


    } else if (message === "device-already-online") {
      const data = {
        status: "auth-failed",                                          // Status message indicating the result (e.g., 'auth_success')
        qr_scanner_state_request: qr_scanner_state_request,             // The current state (e.g., 'authenticated', 'pending')
        device_id: device_id,                                           // The device ID
        did: did,                                                       // The Decentralized Identifier (DID) associated with the device
        sub: sub,                                                       // The subscription or other relevant information
        logFileURI: log_file_uri,
        authToken: authToken,
        message: message                                                // message: device-already-online
      };
  
      // Send the data to the device as a JSON string
      ws_connection_associated_with_qr_scanner_state_request.send(JSON.stringify(data));
      logEvent({
        event: `NOTIFIED DEVICE WITH QR STATE "${qr_scanner_state_request}"`,
        status: 'SUCCESS ✅',
        cause: 'THIS DID IS ALREADY ONLINE',
        device_id: device_id,
        did: did,
      });

    } else if (message === "potential-credential-sharing") {
      const data = {
        status: "auth-failed",                                          // Status message indicating the result (e.g., 'auth_success')
        qr_scanner_state_request: qr_scanner_state_request,             // The current state (e.g., 'authenticated', 'pending')
        device_id: device_id,                                           // The device ID
        did: did,                                                       // The Decentralized Identifier (DID) associated with the device
        sub: sub,                                                       // The subscription or other relevant information
        logFileURI: log_file_uri,
        authToken: authToken,
        message: message                                                // message: potential-credential-sharing
      };
  
      // Send the data to the device as a JSON string
      ws_connection_associated_with_qr_scanner_state_request.send(JSON.stringify(data));
      logEvent({
        event: `NOTIFIED DEVICE WITH QR STATE "${qr_scanner_state_request}"`,
        status: 'SUCCESS ✅',
        cause: 'THIS DID IS NOT ASSOCIATED WITH THIS DEVICE',
        device_id: device_id,
        did: did,
      });
    }
    
  } else {
    // Log if the WebSocket connection is not open or the device was not found
    logEvent({
      event: `UNABLE TO NOTIFY DEVICE WITH QR STATE "${qr_scanner_state_request}"`,
      status: 'FAILED ❌',
      cause: 'DICSONNECTED FROM WEBSOCKET OR THIS QR STATE NOT FOUND',
      did: did,
      device_id: device_id
    });
  }
}


/** [16]
 * Finds a device in the MongoDB database by their Device ID .
 * This function queries the "DEVICE" collection to retrieve a device document 
 * that matches the provided device id.
 *
 * @param {string} device_id - The id of the device to be searched.
 * @returns {Promise<Object|null>} - Returns the device document if found, otherwise returns `null`.
 * @throws {Error} - Throws an error if the database query fails.
 */
const findDeviceByDeviceID = async (device_id) => {
  try {
    // Query the "DEVICE" collection to find a device by the specified device id
    const device = await DEVICE.findOne({ device_id: device_id });

    if (!device) {
      // Log a message if the device does not exist in the database
      logEvent({
        event: 'SEARCH FOR DEVICE',
        status: 'FAILED ❌',
        device_id: device_id,
        cause: `DEVICE ASSOCIATED WITH ID ${device_id} NOT FOUND`
      });
      return null;
    }

    // Return the device document if found
    return device;
  } catch (error) {
    // Log any errors encountered during the database query
    logEvent({
      event: 'SEARCH FOR DEVICE',
      status: 'FAILED ❌',
      device_id: device_id,
      cause: `AN ERROR OCCURRED DURING DEVICE SEARCH IN THE DATABASE: ${error.stack}`
    });
    

    // Throw an error indicating the failure of the database query
    throw new Error('Database query failed');
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
    `  ${green}TIMESTAMP:${reset} ${yellow}${moment().tz("Europe/Athens").format('YYYY-MM-DD HH:mm:ss')}${reset}\n` +
    
    // Closing curly brace
    `${green}}${reset}` +
    
    // Add log end delimiter
    `\n${logEnd}\n`
  );
};
/********* BACKEND SERVER EVENT LOGGING MECHANISM *********/
/************************************************************************************************************************************************************************************************/



/* Export the utility functions for use in other files */
module.exports = {
  findDeviceByDID,                // Finds device by DID
  findDeviceByDeviceID,           // Finds device by Device ID
  getDeviceURI,                   // Retrieves the device URI
  createDeviceDocument,           // Creates a new device entry
  storeLogsToInfluxDB,            // Stores device logs in InfluxDB
  extractTimestamp,               // Extracts timestamp from logs
  malformedLogsExaminator,        // Examines if logs are malformed
  processSessionRequest,          // Process and notifies the devices begin session requests
  notifyDevice,                   // Notify the devices using the web socket connection
  initializeWebSocketServer,      // Initialize the web socket server connection
};

