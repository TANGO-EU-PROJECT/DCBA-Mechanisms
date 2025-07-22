/************************************************************************************************************************************************************************************************/
const express = require('express');                                              /* Import Express framework                            */
const morgan = require('morgan');                                                /* Import Morgan for HTTP request logging              */
const config = require('./BACKEND/CONFIG/config');                               /* Import server configuration settings                */
const controller = require('./BACKEND/API/controllers/controller');              /* Import controller for route handlers                */
const mongoose = require('mongoose');                                            /* Import Mongoose for MongoDB object modeling         */
const { InfluxDBClient } = require('@influxdata/influxdb3-client');
const http = require('http');                                                    /* Import http for creating a HTTP server              */
const WebSocket = require('ws');                                                 /* Import WebSocket library                            */
const { initializeWebSocketServer } = require('./BACKEND/UTILITIES/functions');  /* Import WebSocket functions from utilities           */
//const moment = require('moment');
const moment = require('moment-timezone');
const cors = require('cors');
const authenticatorRoutes = require('./BACKEND/API/routes/authenticatorRoutes'); /* Import AUTHENTICATOR routes */
const resourceRoutes = require('./BACKEND/API/routes/resourceRoutes'); /* Import resource SERVICES routes */
const frontendRoutes = require('./BACKEND/API/routes/frontendRoutes'); /* Import frontend routes */
const path = require('path');
const cookieParser = require('cookie-parser');

/* Define ANSI escape codes for colored console output */                                                                     
const green = '\x1b[32m';     /* Green color                         */
const red = '\x1b[31m';       /* Red color                           */
const yellow = '\x1b[33m';    /* Yellow color                        */
const lightBlue = '\x1b[34m'; /* Light Blue color                    */
const magenta = '\x1b[35m';   /* Magenta color                       */
const reset = '\x1b[0m';      /* Reset color to default              */
const RETRY_INTERVAL_MS = 5000; /* Retry interval in milliseconds */

/* Create an instance of the Express application */
const DCBA_SERVER = express();

/* Create HTTP server */
const server = http.createServer(DCBA_SERVER); 

/* Middleware to parse JSON request bodies */
DCBA_SERVER.use(express.json());
DCBA_SERVER.use(express.urlencoded({ extended: true }));
DCBA_SERVER.use(cors({exposedHeaders: ['set-cookie'], credentials: true, origin : true}));
DCBA_SERVER.use(cookieParser());
/* Middleware for logging HTTP requests using Morgan (set to 'tiny' log format) */
DCBA_SERVER.use(morgan('tiny'));


/* ------------------------- DATABASE CONNECTION (mongo_db) ------------------------- */

// Function to connect to MongoDB
async function connectToMongo() {
  try {
    await mongoose.connect(process.env.MONGO_DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log(`${green}✅ [INFO]${reset} ${lightBlue}SUCCESSFULLY CONNECTED TO MONGODB DATABASE${reset} ${yellow}:${reset} ${green}${moment().tz("Europe/Athens").format('YYYY-MM-DD HH:mm:ss')}${reset}.`);
    return true;
  } catch (err) {
    console.log(`${red}❌ [ERROR]${reset} ${lightBlue}ERROR CONNECTING TO MONGODB:${reset} ${err}, URI ${process.env.MONGO_DB_URI}`);
    return false;
  }
}

/* ------------------------- DATABASE CONNECTION (influx_db) ------------------------- */

// Function to connect to InfluxDB
async function connectToInflux() {
  try {
    const influxDB_Client = new InfluxDBClient({
      host: process.env.INFLUX_DB_URI,
      token: process.env.INFLUX_INITDB_AUTH_TOKEN,
      org: process.env.INFLUX_INITDB_ORG,
      bucket: process.env.INFLUX_INITDB_BUCKET,
    });

    console.log(`${green}✅ [INFO]${reset} ${lightBlue}TESTING INFLUX CONNECTION WITH A SMALL QUERY...${reset}`);
    await influxDB_Client.query('SELECT 1', process.env.INFLUX_INITDB_DATABASE);
    console.log(`${green}✅ [INFO]${reset} ${lightBlue}CONNECTED TO INFLUXDB DATABASE${reset} ${yellow}:${reset} ${green}${moment().tz("Europe/Athens").format('YYYY-MM-DD HH:mm:ss')}${reset}.`);
    return true;
  } catch (err) {
    console.error(`${red}❌ [ERROR]${reset} ${lightBlue}INFLUXDB TEST QUERY FAILED:${reset} ${err.message}`);
    return false;
  }
}


/* ------------------------- SERVER STARTUP ------------------------- */

// Function to initialize the server
async function startServer() {
  let mongoConnected = false;
  let influxConnected = false;

  // First, try to connect to MongoDB
  while (!mongoConnected) {
    mongoConnected = await connectToMongo();
    if (!mongoConnected) {
      console.log(`${yellow}❗ [INFO]${reset} Retrying MongoDB connection in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS)); // Wait 5 seconds
    }
  }

  // Once MongoDB is connected, try to connect to InfluxDB
  while (!influxConnected) {
    influxConnected = await connectToInflux();
    if (!influxConnected) {
      console.log(`${yellow}❗ [INFO]${reset} Retrying InfluxDB connection in 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL_MS)); // Wait 5 seconds
    }
  }

  // After both are connected, proceed to start the Express server
  const internalPort = process.env.SERVER_INTERNAL_BIND_PORT; 
  const externalPort = process.env.SERVER_EXTERNAL_BIND_PORT;
  const ip = config.ServerIPAddr;

  // Initialize WebSocket Server
  const wss = new WebSocket.Server({ server });
  initializeWebSocketServer(wss);

  // Define the routes
  DCBA_SERVER.use('/authenticator', authenticatorRoutes);
  DCBA_SERVER.use('/resource', resourceRoutes);
  DCBA_SERVER.get('/health', controller.getHealthStatus);
  DCBA_SERVER.get('/frontend/access-map', (req, res) => {
    res.sendFile(path.join(__dirname, '/FRONTEND/access-map.html'));
  });
  DCBA_SERVER.use('/frontend', frontendRoutes);
  // Serve static files from the frontend folder
  DCBA_SERVER.use('/frontend', express.static(path.join(__dirname, 'FRONTEND')));


  // Start the Express server
  server.listen(internalPort, ip, () => {
    console.log(`\n${magenta}============================= ${green}SERVER IS NOW LISTENING${reset} ${magenta}=============================\n${green}🔹 ${lightBlue}SERVER HOSTED AT:${reset} ${green}{ ${ip} }${reset}\n${magenta}---- Internally: ${green}${internalPort}${reset}\n${magenta}---- Externally: ${green}${externalPort}${reset}\n${magenta}===================================================================================${reset}\n`);
  });
}

// Start the server process
startServer();
