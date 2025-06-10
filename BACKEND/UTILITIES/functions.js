/* 
 * Utility module that provides various helper functions such as 
 * reading/writing files, password encryption, cryptographic operations, 
 * database interactions. 
 */
/*************************************************************************** START OF IMPORT SECTION ***************************************************************************/
require("dotenv").config();                                          /* Load environment variables from the .env file                         */
const fs = require('fs');                                            /* File System module for handling file operations                       */
const bcrypt = require('bcrypt');                                    /* Library for securely hashing and verifying passwords                  */
const crypto = require('crypto');                                    /* Cryptography module for secure hashing, signing, and encryption tasks */
const { InfluxDB, Point } = require('@influxdata/influxdb-client');  /* InfluxDB Client for logging and storing time-series data              */
const csv = require('csv-parser');                                   /* CSV parser module for reading and processing .csv files               */
const path = require('path');                                        /* Path module for handling and resolving file paths                     */
const WebSocket = require('ws');                                     /* WebSocket                                                             */
const moment = require('moment-timezone');                           /* For handling timestamps                                               */

/* ─────────────────────────────────────────────────────────────────────────────────── */
/* Import the MongoDB schema models dynamically using paths from environment variables */
/* ─────────────────────────────────────────────────────────────────────────────────── */

/* Retrieve the paths to MongoDB schema models from the environment variables */
const deviceModelPath = process.env.MONGO_DB_DEVICE_SCHEME_PATH;
const sessionRequestModelPath = process.env.MONGO_DB_SESSION_REQUEST_SCHEME_PATH;

/* Dynamically load the MongoDB schema models based on the paths specified in .env */
const DEVICE = require(path.resolve(deviceModelPath));
const SESSION_REQUEST = require(path.resolve(sessionRequestModelPath));

/* Returns the wss connections associated with their qr_state_requests */
const WSS_CONNECTIONS_FROM_DEVICE_ID = new Map(); 
const deviceAlertModelPath = process.env.MONGO_DB_DEVICE_ALERT_SCHEME_PATH;
const ALERT = require(path.resolve(deviceAlertModelPath));

/* ────────────────────────────────────────────────────────────────────────────── */
/* ANSI escape codes for colored console output to improve log readability        */
/* ────────────────────────────────────────────────────────────────────────────── */                                                                   
const green = '\x1b[32m';     /* Green color                         */
const red = '\x1b[31m';       /* Red color                           */
const yellow = '\x1b[33m';    /* Yellow color                        */
const lightBlue = '\x1b[34m'; /* Light Blue color                    */
const magenta = '\x1b[35m';   /* Magenta color                       */
const reset = '\x1b[0m';      /* Reset color to default              */

/*************************************************************************** END OF IMPORT SECTION ***************************************************************************/










/*************************************************************************** START OF API ENDPOINTS HELPER FUNCTIONS IMPLEMENTATION ***************************************************************************/
/** [1]
 * Retrieves the URI of a device based on its DID.
 * This function queries the "DEVICE" collection to find the devices's details.
 *
 * @param {string} did                             - The DID (Decentralized Identifier) of the device which URI is to be retrieved.
 * @returns {Promise<{uriContent: string} | null>} - A promise that resolves to an object containing the URI if found, otherwise null.
 */
const getDeviceURI = async (did) => {
  try {
    /* Attempt to retrieve the device's details from the database using the 'findDeviceByDID' function */
    const device = await findDeviceByDID(did);

    /* If a device record is found, return an object containing the URI. Otherwise, return null. */
    return device ? { uriContent: device.URI } : null;
  } catch (error) {
    /* Log any errors that occur during the process */
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
 * @param {string} did          - The Decentralized Identifier (DID) uniquely identifying the device.
 * @param {string} sub          - The sub claim associated with the device, used for authentication.
 * @param {string} device_id    - The device ID associated with the device.
 * @param {string} log_file_uri - The log file uri which offline logs will be stored internally/locally on the device.
 * @param {string} role         - The device's employee role (employee or customer).
 * @returns {Promise<void>}     - A promise that resolves once the device has been successfully stored to the database.
 */
const createDeviceDocument = async (did, sub, device_id, log_file_uri, role) => {
  try {
    const now = moment().utc().toDate();
    const initialLocation = {
      estimated_location: 'PERMITTED_AREA',
      first_seen_at: now,
      last_seen_at: now,
      duration_s: 0
    };

    const locationsDir = path.join(__dirname, '../SCRIPTS/LOCALIZATION/RIASTONE');
    const possibleLocations = getPossibleLocations(locationsDir);


    /* Determine restricted areas based on role */
    let restricted_areas = [];
    if (role === 'employee') {
      /* EMPLOYEE */
      restricted_areas = possibleLocations.filter(loc => loc === 'UNKNOWN');
    } else if (role === 'customer') {
      /* CUSTOMER */
      restricted_areas = possibleLocations.filter(loc => loc !== 'PERMITTED_AREA');
    } else {
      /* INVALID ROLE PROVIDED */
      throw new Error(`Invalid role provided: ${role}`);
    }

    /* Create the new device */
    const newDevice = new DEVICE({
      did,
      sub,
      device_id,
      log_file_uri,
      role,
      status: 'online',
      location_history: [initialLocation],
      login_timestamp: now,
      restricted_areas
    });

    /* Save it as document */
    await newDevice.save();

    logEvent({
      event: 'DEVICE REGISTERED TO THE DATABASE',
      status: 'SUCCESS ✅',
      did: did,
      device_id: device_id
    });

  } catch (error) {
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
 * @param {string} did             - The DID of the device to be searched.
 * @returns {Promise<Object|null>} - Returns the device document if found, otherwise returns `null`.
 * @throws {Error}                 - Throws an error if the database query fails.
 */
const findDeviceByDID = async (did) => {
  try {
    /* Query the "DEVICE" collection to find a device by the specified DID */
    const device = await DEVICE.findOne({ did: did });

    if (!device) {
      /* Log a message if the device does not exist in the database */
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
    /* Return the device document if found */
    return device;
  } catch (error) {
    /* Log any errors encountered during the database query */
    logEvent({
      event: 'SEARCH FOR DEVICE',
      status: 'FAILED ❌',
      did: did,
      cause: `AN ERROR OCCURRED DURING DEVICE SEARCH IN THE DATABASE: ${error.stack}`
    });
    

    /* Throw an error indicating the failure of the database query */
    throw new Error('Database query failed');
  }
};




/** [4]
 * Stores the device logs to the InfluxDB database.
 * Logs are stored in the specified bucket, tagged by the DID (Decentralized Identifier).
 * This function allows logging device actions and provides an optional callback after storage.
 *
 * @param {string} device_id      - The device_id associated with the employees/customers devices.
 * @param {string} did            - The DID (Decentralized Identifier) associated with the log.
 * @param {string} log            - The log message to be stored in the database.
 * @param {Function} [onComplete] - Optional callback function that executes once the log is stored.
 */
async function storeLogsToInfluxDB(device_id, did, log, onComplete) {


  try {
    /* Initialize InfluxDB client using credentials from environment variables */
    const influxDB = new InfluxDB({
      url: process.env.INFLUX_DB_URI,
      token: process.env.INFLUX_INITDB_AUTH_TOKEN
    });

    /* Create a write API instance for the specified organization and bucket */
    const writeApi = influxDB.getWriteApi(
      process.env.INFLUX_INITDB_ORG,
      process.env.INFLUX_INITDB_BUCKET,
      /* Write precision in nanoseconds */
      'ns' 
    );

    /* Create a new data point for InfluxDB */
    const point = new Point('ANDROID_LOGS_MEASUREMENT')
      .tag('device_id', device_id)     /* Tag the data point by device's ID              */
      .stringField('LOG_MESSAGE', log) /* Store the log message as a string field        */
      .timestamp(new Date());          /* Use the extracted timestamp for the data point */

    /* Write the point to InfluxDB */
    writeApi.writePoint(point);
    
    /* Ensure the data is flushed and written to the database */
    await writeApi.flush();
    /* Properly close the write API to ensure the data is written */
    await writeApi.close(); 

    logEvent({
      event: '📥 ANDROID LOG STORED TO INFLUX DATABASE',
      status: 'SUCCESS ✅',
      device_id: device_id,
      did: did,
      cause: 'DEVICE DEVICE UPLOADING LOGS -- ACTIVE SESSION'
    });

    /* Invoke the callback if provided */
    if (onComplete) onComplete();
  } catch (error) {
    logEvent({
      event: '📥 ANDROID LOG STORED TO INFLUX DATABASE',
      status: 'FAILED ❌',
      did: did,
      device_id: device_id,
      cause: `AN ERROR OCCURRED WHILE STORING THE ANDROID LOG TO THE INFLUXDB DATABASE: ${error.stack}`
    });

    /* Ensure the callback is invoked even in case of error to prevent blocking execution */
    if (onComplete) onComplete();
  }
}




/** [5]
 * Extracts the timestamp from a log string.
 * 
 * @param {string} log    - The log string containing a timestamp.
 * @returns {string|null} - The extracted timestamp in "MM-DD HH:mm:ss.SSS" format or null if not found.
 */
function extractTimestamp(log) {
  /* Regular expression to match timestamp format: MM-DD HH:mm:ss.SSS */
  const timestampRegex = /(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/;
  const match = log.match(timestampRegex);
  /* Return timestamp or null if not found */
  return match ? match[1] : null; 
}


/** [6]
 * Examines a log string to determine if it follows the expected format.
 * 
 * Expected format: "MM-DD HH:mm:ss.SSS PID TID LEVEL TAG: MESSAGE"
 * 
 * @param {string} log - The log string to validate.
 * @returns {boolean}  - Returns `true` if the log is valid, otherwise `false`.
 */
function malformedLogsExaminator(log) {
  /* Regular expression for expected log format */
  const logRegex = /^(\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([DIWE])\s+([\w\d]+):\s+(.*)$/;

  const match = log.match(logRegex);
  if (!match) {
    /* Log does not match expected format */
    return false; 
  }

  /* Extracted log components */
  const [ , date, time, pid, tid, level, tag, message ] = match;

  /* Validate process ID (PID) and thread ID (TID) */
  if (isNaN(Number(pid)) || isNaN(Number(tid))) return false;

  /* Validate log level (should be one of D, I, W, E) */
  const validLevels = new Set(["D", "I", "W", "E"]);
  if (!validLevels.has(level)) return false;

  /* Validate tag (should be at least 2 characters) */
  if (!tag || tag.length < 2) return false;

  /* Validate message (should not be empty or just spaces) */
  if (!message || message.trim().length === 0) return false;

  /* Log is valid */
  return true; 
}




/** [7]
 * Handles the session request lookup and notification process.
 * This function searches for a session request in the database using the provided qr state(state), 
 * notifies the relevant device, and creates a new device record if necessary.
 * @param {string} authToken                - The authorization JWT Token
 * @param {string} state                    - The unique ID of the QR state request
 * @param {string} did                      - The DID (unique identifier) associated with the device.
 * @param {string} sub                      - The subject identifier associated with the device.
 * @returns {Promise<void>}                 - Resolves once the session request is processed and necessary actions are taken.
 */
async function processSessionRequest(authToken, state, did, sub, req) {

  try {
    /* Search for the session request in MongoDB based on the state */
    const sessionRequest = await SESSION_REQUEST.findOne({ state: state });

    if (sessionRequest) {
      const device_id = sessionRequest.device_id;
      const log_file_uri = sessionRequest.log_file_uri;
      const role = sessionRequest.role;

      /* Remove the processed session request from the database */
      await SESSION_REQUEST.deleteOne({ _id: sessionRequest._id });

      logEvent({
        event: 'PROCESSING SESSION REQUEST',
        cause: 'NOTIFIED DEVICE AND DELETED THEIR SESSION REQUEST FROM THE DATABASE',
        status: 'SUCCESS ✅',
        did: did,
        device_id: device_id,
        ip: req.ip
      });

      /* Look for the device in the DEVICE collection using the findDeviceByDeviceID function */
      const existingDevice = await findDeviceByDeviceID(device_id);

      if (!existingDevice) {
        /* Device associated with device_id not found */ 
        /* Search in the Mongo for a device with its did */
        const deviceWithSameDID = await findDeviceByDID(did);
        if (!deviceWithSameDID) {
          /* Device associated with did not found to. So, create it */
          await createDeviceDocument(did, sub, device_id, log_file_uri, role);
          /* Notify the device via WebSocket */
          notifyDevice(authToken, state, device_id, did, sub, log_file_uri, "session-request-valid");
          logEvent({
            event: 'DEVICE STATUS UPDATED',
            status: 'SUCCESS ✅',
            cause: 'DEVICE MARKED AS ONLINE',
            did: did,
            device_id: device_id,
            ip: req.ip
          });
          /* Authentication Success */
          return { status: 200, message: "Authentication success. Device status updated to online." };
        } else {
          /* Someone tried to log in from his/her device, using an existing DID */
          /* Notify the device via WebSocket */
          notifyDevice(authToken, state, device_id, did, sub, log_file_uri, "potential-credential-sharing");
          logEvent({
            event: 'UNAUTHORIZED ATTEMPT FROM USING CREDENTIALS FROM ANOTHER DEVICE',
            status: 'FAILED ❌',
            did: did,
            device_id: device_id,
            ip: req.ip
          });
          /* Authentication Failed */
          return { status: 401, message: "Credentials don't match this device." };
        }
      } else {
        /* This device already exists. Need to ensure that its did matches the did request */
        if (existingDevice.did === did) {
          /* The device associated with this did already exists */
          /* 1. Check if the device is already online */
          if (existingDevice.status === 'offline') {
            existingDevice.status = 'online';             /* Modify the status                */ 
            existingDevice.login_timestamp = new Date();  /* Modify the login_timestamp       */ 
            await existingDevice.save();                  /* Save the updated device document */
            logEvent({
              event: 'DEVICE ALREADY REGISTERED IN THE DATABASE',
              status: 'SUCCESS ✅',
              did: did,
              device_id: device_id,
              ip: req.ip
            });
            /* Notify the device via WebSocket */
            notifyDevice(authToken, state, device_id, did, sub, log_file_uri, "session-request-valid");
            logEvent({
              event: 'DEVICE STATUS UPDATED',
              status: 'SUCCESS ✅',
              cause: 'DEVICE MARKED AS ONLINE',
              did: did,
              device_id: device_id,
              ip: req.ip
            });
            /* Authentication Success */
            return { status: 200, message: "Authentication success. Device status updated to online." };
          } else {
            /* The specific device is already online */
            logEvent({
              event: 'DEVICE ALREADY ONLINE',
              status: 'FAILED ❌',
              did: did,
              device_id: device_id,
              ip: req.ip
            });
            notifyDevice(authToken, state, device_id, did, sub, log_file_uri, "device-already-online");
            /* Authentication Failed */
            return { status: 409, message: "Device already online." };
          }
          
        } else {
          /* Someone tried to log in to their device using another employee's credentials */
          notifyDevice(authToken, state, device_id, did, sub, log_file_uri, "potential-credential-sharing");
          logEvent({
            event: 'UNAUTHORIZED ATTEMPT USING CREDENTIALS FROM ANOTHER DEVICE',
            status: 'FAILED ❌',
            did: did,
            device_id: device_id,
            ip: req.ip
          });
          /* Authentication Failed */
          return { status: 401, message: "Credentials don't match this device." };
        }
      }
    } else {
      /* Notify the device that the session request is expired, in order to re-generate a new unique QR */
      notifyDevice(authToken, state, "unknown", did, sub, "unknown", "session-request-expired");
      logEvent({
        event: 'SEARCH FOR SESSION REQUEST FOR DEVICE',
        status: 'FAILED ❌',
        did: did,
        cause: 'THE SESSION REQUEST HAS EXPIRED',
        ip: req.ip
      });
      /* Authentication Failed */
      return { status: 410, message: "Session request expired." };
    }
  } catch (error) {
    /* Handle any errors that occur during the session request processing */
    logEvent({
      event: 'PROCESSING SESSION REQUEST',
      status: 'FAILED ❌',
      did: did,
      cause: `AN ERROR OCCURRED DURING THE PROCESSING OF THE SESSION REQUEST: ${error.stack}`,
      ip: req.ip

    });    
    /* Authentication Failed */
    return { status: 500, message: "Internal server error. Authentication failed." };
  }
}



/** [8]
 * Initializes a WebSocket server and handles client connections.
 * The function listens for WebSocket connections, associates qr_scanner_state_request with their WebSocket instances,
 * and manages disconnections.
 * 
 * @param {Object} wss - The WebSocket server instance to initialize.
 */
function initializeWebSocketServer(wss) {
  try {
    wss.on('connection', (ws, req) => {

      /* Extract the device_id from the parameters */
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const device_id = urlParams.get('device_id');

      if (device_id) {
        /* Store the connection using only device_id */
        WSS_CONNECTIONS_FROM_DEVICE_ID.set(device_id, ws);

        logEvent({
          event: `DEVICE WITH "${device_id}" CONNECTED VIA WEBSOCKET`,
          status: 'SUCCESS ✅',
          cause: 'INITIATING SESSION',
          device_id: device_id
        });
      } else {
        logEvent({
          event: 'WEBSOCKET CONNECTION ATTEMPT WITHOUT DEVICE ID',
          status: 'FAILED ❌',
          cause: 'MISSING device_id IN URL QUERY',
        });
        ws.close(1008, 'Missing device_id');
        return;
      }

      ws.on('message', (message) => {
        console.log(`Received message from device_id=${device_id}:`, message);
      });

      ws.on('close', () => {
        if (device_id) {
          WSS_CONNECTIONS_FROM_DEVICE_ID.delete(device_id);
          logEvent({
            event: `DEVICE WITH "${device_id}" DISCONNECTED FROM WEBSOCKET`,
            status: 'SUCCESS ✅',
            cause: 'SESSION TERMINATED',
            device_id: device_id
          });
        }
      });
    });

    logEvent({
      event: `WEBSOCKET SERVER INITIALIZED SUCCESSFULLY AT ${moment().utc().format('YYYY-MM-DD HH:mm:ss')} UTC`,
      status: 'SUCCESS ✅',
    });

  } catch (error) {
    logEvent({
      event: `WEBSOCKET SERVER FAILED TO INITIALIZE`,
      status: 'FAILED ❌',
      error: error.message,
    });
  }
}




/** [9]
 * Notifies a specific client (device) via WebSocket when certain events occur.
 * This function checks if the WebSocket connection for the given device_id is open,
 * and if so, sends the message with the relevant data.
 * 
 * @param {string} authToken                - The authorization token prompt for validation.
 * @param {string} state                    - The current state (unique ID) of the session (e.g., 'auth_success').
 * @param {string} device_id                - The device identifier.
 * @param {string} did                      - The Decentralized Identifier (DID) associated with the device.
 * @param {string} sub                      - Subscription or other relevant information.
 * @param {string} log_file_uri             - The device local filepath in which the offline logs will be stored temporarily.
 * @param {string} message                  - Based on this message, the Authenticator app decides which alert to display.
 */
function notifyDevice(authToken, state, device_id, did, sub, log_file_uri, message) {
  /* Retrieve the WebSocket connection associated with the device_id */
  const device_id_ws_connection = WSS_CONNECTIONS_FROM_QR_SCANNER_REQUESTS.get(device_id);

  /* Check if the device's WebSocket connection exists and is open */
  if (device_id_ws_connection && device_id_ws_connection.readyState === WebSocket.OPEN) {
    /* SCENARIO 1: Session request has been expired */
    /* Prepare the data to be sent to the device */
    if (message === "session-request-expired") {
      const data = {
        status: "auth-failed",                                          /* Status message indicating the result (e.g., 'auth_success')   */
        state: state,                                                   /* The current state                                             */
        device_id: device_id,                                           /* The device ID                                                 */
        did: did,                                                       /* The Decentralized Identifier (DID) associated with the device */
        sub: sub,                                                       /* The subscription or other relevant information                */
        logFileURI: log_file_uri,                                       /* The log file uri                                              */
        authToken: authToken,                                           /* The auth token                                                */
        message: message                                                /* message: session-request-expired                              */
      };
  
      /* Send the data to the device as a JSON string */
      device_id_ws_connection.send(JSON.stringify(data));
  
      logEvent({
        event: `NOTIFIED DEVICE WITH QR STATE "${state}"`,
        status: 'SUCCESS ✅',
        cause: 'SESSION REQUEST EXPIRED',
        device_id: device_id,
        did: did,
      });
    }
    /* SCENARIO 2: Session request is valid */ 
    else if (message === "session-request-valid") {
      const data = {
        status: "auth-success",                                         /* Status message indicating the result (e.g., 'auth_success')   */
        state: state,                                                   /* The current state                                             */
        device_id: device_id,                                           /* The device ID                                                 */
        did: did,                                                       /* The Decentralized Identifier (DID) associated with the device */
        sub: sub,                                                       /* The subscription or other relevant information                */
        logFileURI: log_file_uri,                                       /* The log file uri                                              */
        authToken: authToken,                                           /* The auth token                                                */
        message: message                                                /* message: session-request-valid                                */
      };
  
      /* Send the data to the device as a JSON string */
      device_id_ws_connection.send(JSON.stringify(data));
      logEvent({
        event: `NOTIFIED DEVICE WITH QR STATE "${state}"`,
        status: 'SUCCESS ✅',
        cause: 'DEVICE AUTHENTICATED',
        device_id: device_id,
        did: did,
      });


    } 
    /* SCENARIO 3: Device is already online */ 
    else if (message === "device-already-online") {
      const data = {
        status: "auth-failed",                                          /* Status message indicating the result (e.g., 'auth_success')   */
        state: state,                                                   /* The current state                                             */
        device_id: device_id,                                           /* The device ID                                                 */
        did: did,                                                       /* The Decentralized Identifier (DID) associated with the device */
        sub: sub,                                                       /* The subscription or other relevant information                */
        logFileURI: log_file_uri,                                       /* The log file uri                                              */
        authToken: authToken,                                           /* The auth token                                                */
        message: message                                                /* message: device-already-online                                */
      };
  
      /* Send the data to the device as a JSON string */
      device_id_ws_connection.send(JSON.stringify(data));
      logEvent({
        event: `NOTIFIED DEVICE WITH QR STATE "${state}"`,
        status: 'SUCCESS ✅',
        cause: 'THIS DID IS ALREADY ONLINE',
        device_id: device_id,
        did: did,
      });

    } 
    /* SCENARIO 4: Potential Credential Sharing */ 
    else if (message === "potential-credential-sharing") {
      const data = {
        status: "auth-failed",                                          /* Status message indicating the result (e.g., 'auth_success')   */
        state: state,                                                   /* The current state                                             */     
        device_id: device_id,                                           /* The device ID                                                 */
        did: did,                                                       /* The Decentralized Identifier (DID) associated with the device */
        sub: sub,                                                       /* The subscription or other relevant information                */ 
        logFileURI: log_file_uri,                                       /* The log file uri                                              */
        authToken: authToken,                                           /* The auth token                                                */
        message: message                                                /* message: potential-credential-sharing                         */
      };
  
      /* Send the data to the device as a JSON string */
      device_id_ws_connection.send(JSON.stringify(data));
      logEvent({
        event: `NOTIFIED DEVICE WITH QR STATE "${state}"`,
        status: 'SUCCESS ✅',
        cause: 'THIS DID IS NOT ASSOCIATED WITH THIS DEVICE',
        device_id: device_id,
        did: did,
      });
    }  
    /* SCENARIO 5: Potential Credential Sharing */ 
    else if (message === "invalid-verifiable-credentials") {
      const data = {
        status: "auth-failed",                                          /* Status message indicating the result (e.g., 'auth_success')   */
        state: state,                                                   /* The current state                                             */     
        device_id: device_id,                                           /* The device ID                                                 */
        did: did,                                                       /* The Decentralized Identifier (DID) associated with the device */
        sub: sub,                                                       /* The subscription or other relevant information                */ 
        logFileURI: log_file_uri,                                       /* The log file uri                                              */
        authToken: authToken,                                           /* The auth token                                                */
        message: message                                                /* message: potential-credential-sharing                         */
      };
  
      /* Send the data to the device as a JSON string */
      device_id_ws_connection.send(JSON.stringify(data));
      logEvent({
        event: `NOTIFIED DEVICE WITH QR STATE "${state}"`,
        status: 'SUCCESS ✅',
        cause: 'INVALID VERIFIABLE CREDENTIALS',
        device_id: device_id,
        did: did,
      });
    } 
    
  } else {
    /* Log if the WebSocket connection is not open or the device was not found */
    logEvent({
      event: `UNABLE TO NOTIFY DEVICE WITH QR STATE "${state}"`,
      status: 'FAILED ❌',
      cause: 'DICSONNECTED FROM WEBSOCKET OR THIS QR STATE NOT FOUND',
      did: did,
      device_id: device_id
    });
  }
}


/** [10]
 * Finds a device in the MongoDB database by their Device ID .
 * This function queries the "DEVICE" collection to retrieve a device document 
 * that matches the provided device id.
 *
 * @param {string} device_id       - The id of the device to be searched.
 * @returns {Promise<Object|null>} - Returns the device document if found, otherwise returns `null`.
 * @throws {Error}                 - Throws an error if the database query fails.
 */
const findDeviceByDeviceID = async (device_id) => {
  try {
    /* Query the "DEVICE" collection to find a device by the specified device id */
    const device = await DEVICE.findOne({ device_id: device_id });

    if (!device) {
      /* Log a message if the device does not exist in the database */
      logEvent({
        event: 'SEARCH FOR DEVICE',
        status: 'FAILED ❌',
        device_id: device_id,
        cause: `DEVICE ASSOCIATED WITH ID ${device_id} NOT FOUND`
      });
      return null;
    }

    /* Return the device document if found */
    return device;
  } catch (error) {
    /* Log any errors encountered during the database query */
    logEvent({
      event: 'SEARCH FOR DEVICE',
      status: 'FAILED ❌',
      device_id: device_id,
      cause: `AN ERROR OCCURRED DURING DEVICE SEARCH IN THE DATABASE: ${error.stack}`
    });
    
    /* Throw an error indicating the failure of the database query */
    throw new Error('Database query failed');
  }
};

/** [11]
 * Handles updating a device's location history and alerts based on its current location.
 *
 * This function checks if the device is detected in the same location as its last recorded
 * location or a different location. It updates the location history duration and timestamps,
 * and manages alerts if the device enters or remains in restricted areas.
 *
 * @param {Object} device          - The device document containing current state and history
 * @param {string} currentLocation - The newly estimated location of the device
 * @param {Date} now               - The current timestamp (Date object)
 * @param {Object} req             - Express request object for logging IP
 *
 * @returns {Promise<string>}             - The access status after the location update ('ACCESS_PERMITTED' or 'ACCESS_RESTRICTED')
 */
async function handleDeviceLocationUpdate(device, currentLocation, now, req) {
  try {
    /* Default access status is permitted unless proven otherwise */
    let accessStatus = 'ACCESS_PERMITTED';

    /* Get the last known location entry from the device's location history (most recent entry) */
    const lastLocationEntry = device.location_history[0] || null;

    /* Scenario 1: Device detected in the SAME location as last entry */
    if (
      lastLocationEntry &&
      lastLocationEntry.estimated_location === currentLocation &&
      device.login_timestamp &&
      device.login_timestamp <= lastLocationEntry.last_seen_at
    ) {
      /* Calculate the updated duration the device has spent in the current location */
      const updatedDurationSeconds = Math.floor(
        (now - new Date(lastLocationEntry.first_seen_at)) / 1000
      );

      /* Update the last_seen_at and duration_s fields for the latest location entry in DB */
      await DEVICE.updateOne(
        { device_id: device.device_id, "location_history.0.estimated_location": currentLocation },
        {
          $set: {
            "location_history.0.last_seen_at": now,
            "location_history.0.duration_s": updatedDurationSeconds
          }
        }
      );

      /* If this location is restricted, update the latest alert accordingly */
      if (device.restricted_areas.includes(currentLocation)) {
        accessStatus = 'ACCESS_RESTRICTED';

        /* Retrieve the latest alert for this device and did, sorted by most recent first_seen_at */
        const latestAlert = await ALERT.findOne({ device_id: device.device_id, did: device.did }).sort({ 'alert_info.first_seen_at': -1 });

        if (latestAlert) {
          /* Update the last_seen_at and duration_s on the latest alert document */
          await ALERT.updateOne(
            { _id: latestAlert._id },
            {
              $set: {
                "alert_info.last_seen_at": now,
                "alert_info.duration_s": updatedDurationSeconds
              }
            }
          );

          /* Log success event for alert update */
          logEvent({
            event: 'ALERT UPDATED (RIA)',
            status: 'SUCCESS ✅',
            did: device.did,
            device_id: device.device_id,
            ip: req.ip,
          });
        } 
      }

    } else {
      /* Scenario 2: Device detected in a DIFFERENT location than last entry */

      if (device.location_history.length > 0) {
        /* Update duration and last_seen_at of the previous location entry if applicable */
        if (device.login_timestamp && device.login_timestamp <= lastLocationEntry.last_seen_at) {
          const updatedDurationSeconds = Math.floor(
            (now - new Date(lastLocationEntry.first_seen_at)) / 1000
          );

          await DEVICE.updateOne(
            { device_id: device.device_id, "location_history.0.estimated_location": lastLocationEntry.estimated_location },
            {
              $set: {
                "location_history.0.last_seen_at": now,
                "location_history.0.duration_s": updatedDurationSeconds
              }
            }
          );

          /* If the current location is restricted, handle alert updates and creation */
          if (device.restricted_areas.includes(currentLocation)) {
            accessStatus = 'ACCESS_RESTRICTED';

            /* If the previous location was also restricted, update its latest alert */
            if (device.restricted_areas.includes(lastLocationEntry.estimated_location)) {
              const latestAlert = await ALERT.findOne({ device_id: device.device_id, did: device.did }).sort({ 'alert_info.first_seen_at': -1 });

              if (latestAlert) {
                await ALERT.updateOne(
                  { _id: latestAlert._id },
                  {
                    $set: {
                      "alert_info.last_seen_at": now,
                      "alert_info.duration_s": updatedDurationSeconds
                    }
                  }
                );

                logEvent({
                  event: 'LATEST ALERT UPDATED BEFORE ACCESS TO PERMITTED AREA (RIA)',
                  status: 'SUCCESS ✅',
                  did: device.did,
                  device_id: device.device_id,
                  ip: req.ip,
                });
              }
            }

            /* Generate a new alert document for the new restricted location */
            const alertDoc = new ALERT({
              device_id: device.device_id,
              did: device.did,
              alert_info: {
                estimated_location: currentLocation,
                first_seen_at: now,
                last_seen_at: now,
                duration_s: 0
              }
            });

            await alertDoc.save();

            logEvent({
              event: 'ALERT GENERATED (RIA)',
              status: 'SUCCESS ✅',
              did: device.did,
              device_id: device.device_id,
              ip: req.ip,
            });

          } else {
            /* Current location is permitted — update latest alert duration if exists */
            accessStatus = 'ACCESS_PERMITTED';

            const latestAlert = await ALERT.findOne({ device_id: device.device_id, did: device.did }).sort({ 'alert_info.first_seen_at': -1 });

            if (latestAlert) {
              await ALERT.updateOne(
                { _id: latestAlert._id },
                {
                  $set: {
                    "alert_info.last_seen_at": now,
                    "alert_info.duration_s": updatedDurationSeconds
                  }
                }
              );

              logEvent({
                event: 'LATEST ALERT UPDATED BEFORE ACCESS TO PERMITTED AREA (RIA)',
                status: 'SUCCESS ✅',
                did: device.did,
                device_id: device.device_id,
                ip: req.ip,
              });
            }
          }
        }
      }

      /* Add the new location entry to the front of the device's location history array */
      await DEVICE.updateOne(
        { device_id: device.device_id },
        {
          $push: {
            location_history: {
              $each: [{
                estimated_location: currentLocation,
                first_seen_at: now,
                last_seen_at: now,
                duration_s: 0
              }],
              $position: 0
            }
          }
        }
      );
    }

    /* If we reach this point without exceptions, return success */

  } catch (error) {
    logEvent({
      event: 'SOMETHING UNEXPECTED HAPPENED DURING LOCATION/ALERT UPDATES',
      status: 'FAILED ❌',
      did: device.did,
      device_id: device.device_id,
      ip: req.ip,
      cause: `ERROR STACK TRACE: ${error.stack}`
    });
  }
}



/** [12]
 * Retrieves a list of possible locations from a directory of CSV files.
 *
 * This function reads all files in the specified directory, filters for `.csv` files,
 * and extracts the base names (excluding extensions), converting them to uppercase
 * to represent possible location identifiers.
 *
 * @param {string} directoryPath - The absolute or relative path to the directory containing CSV files
 *
 * @returns {string[]}           - An array of uppercase location names derived from CSV file names
 */
const getPossibleLocations = (directoryPath) => {
  const files = fs.readdirSync(directoryPath);
  return files
    .filter(file => file.endsWith('.csv'))
    .map(file => path.basename(file, '.csv').toUpperCase());
};


/** [13]
 * Creates a delay for a specified amount of time.
 *
 * This function returns a Promise that resolves after the given time in milliseconds.
 * It is useful for introducing pauses in asynchronous workflows using `await`.
 *
 * @param {number} time     - The duration to wait in milliseconds
 *
 * @returns {Promise<void>} - A Promise that resolves after the specified delay
 */
function delay(time) {
  return new Promise(function(resolve) { 
      setTimeout(resolve, time);
  });
}
/*************************************************************************** END OF API ENDPOINTS HELPER FUNCTIONS IMPLEMENTATION ***************************************************************************/







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
  handleDeviceLocationUpdate,
  delay
};

