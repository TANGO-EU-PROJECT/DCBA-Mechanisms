/************************************************************************************************************************************************************************************************/
const express = require('express');                                              /* Import Express framework                            */
const morgan = require('morgan');                                                /* Import Morgan for HTTP request logging              */
const config = require('./BACKEND/CONFIG/config');                               /* Import server configuration settings                */
const routes = require('./BACKEND/API/routes/routes');                           /* Import API routes                                   */
const controller = require('./BACKEND/API/controllers/controller');              /* Import controller for route handlers                */
const dotenv = require('dotenv');                                                /* Import dotenv for environment variable management   */
const mongoose = require('mongoose');                                            /* Import Mongoose for MongoDB object modeling         */
const { InfluxDBClient } = require('@influxdata/influxdb3-client');
const http = require('http');                                                    /* Import http for creating a HTTP server              */
const WebSocket = require('ws');                                                 /* Import WebSocket library                            */
const { initializeWebSocketServer } = require('./BACKEND/UTILITIES/functions');  /* Import WebSocket functions from utilities           */
const moment = require('moment');
const cors = require('cors');
const path = require('path');
const frontendRoutes = require('./BACKEND/API/routes/frontendRoutes');                 /* Import FRONTEND API routes */
const authenticatorRoutes = require('./BACKEND/API/routes/authenticatorRoutes');       /* Import AUTHENTICATOR routes */
const externalServicesRoutes = require('./BACKEND/API/routes/externalServicesRoutes'); /* Import EXTERNAL SERVICES routes */

const cookieParser = require('cookie-parser');

/* Define ANSI escape codes for colored console output */                                                                     
const green = '\x1b[32m';     /* Green color                         */
const red = '\x1b[31m';       /* Red color                           */
const yellow = '\x1b[33m';    /* Yellow color                        */
const lightBlue = '\x1b[34m'; /* Light Blue color                    */
const magenta = '\x1b[35m';   /* Magenta color                       */
const reset = '\x1b[0m';      /* Reset color to default              */



/* Create an instance of the Express application */
const DCBA_SERVER = express();

/* Create HTTP server */
const server = http.createServer(DCBA_SERVER); 

/* Middleware to parse JSON request bodies */
DCBA_SERVER.use(express.json());
DCBA_SERVER.use(cors({exposedHeaders: ['set-cookie'], credentials: true, origin : true}));
DCBA_SERVER.use(cookieParser());
/* Middleware for logging HTTP requests using Morgan (set to 'tiny' log format) */
DCBA_SERVER.use(morgan('tiny'));


/************************************************************************************************************************************************************************************************/




/* ------------------------- DATABASE CONNECTION (mongo_db) ------------------------- */

// Connect to MongoDB Container
mongoose.connect(process.env.MONGO_DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log(`${green}✅ [INFO]${reset} ${lightBlue}SUCCESSFULLY CONNECTED TO MONGODB DATABASE${reset} ${yellow}:${reset} ${green}${moment().format('YYYY-MM-DD HH:mm:ss')}${reset}.`);
  })
  .catch((err) => {
    console.log(`${red}❌ [ERROR]${reset} ${lightBlue}ERROR CONNECTING TO MONGODB:${reset} ${err}, URI ${process.env.MONGO_DB_URI}`);
  });


/* ------------------------- DATABASE CONNECTION (influx_db) ------------------------- */
// Connect to the InfluxDB Container
const influxDB_Client = new InfluxDBClient({
  host: process.env.INFLUX_DB_URI,
  token: process.env.INFLUX_INITDB_AUTH_TOKEN,
  org: process.env.INFLUX_INITDB_ORG,
  bucket: process.env.INFLUX_INITDB_BUCKET,
});

async function checkInfluxWithQuery() {
  try {
    console.log(`${green}✅ [INFO]${reset} ${lightBlue}TESTING INFLUX CONNECTION WITH A SMALL QUERY...${reset}`);
    const result = await influxDB_Client.query('SELECT 1', process.env.INFLUX_INITDB_DATABASE);
    //Query Completed! 
    console.log(`${green}✅ [INFO]${reset} ${lightBlue}CONNECTED TO INFLUXDB DATABASE${reset} ${yellow}:${reset} ${green}${moment().format('YYYY-MM-DD HH:mm:ss')}${reset}.`);
  } catch (err) {
    console.error(`${red}❌ [ERROR]${reset} ${lightBlue}INFLUXDB TEST QUERY FAILED:${reset} ${err.message}`);
  }
}

// Then call it at startup
checkInfluxWithQuery();

/* ------------------------- ROUTE CONFIGURATION ------------------------- */

// Import routes for handling interaction with employee devices via the Authenticator app
DCBA_SERVER.use('/authenticator', authenticatorRoutes);

// Import routes for handling interaction with external API services
DCBA_SERVER.use('/devices', externalServicesRoutes);

// Define a route to check server status. GET /server/status - Returns basic server status information
DCBA_SERVER.get('/server/status', controller.getServerStatus);

// Import routes for handling interaction with the dcba-frontent dashboard
DCBA_SERVER.use('/frontend', frontendRoutes);

/* ------------------------- ERROR HANDLING ------------------------- */

// Middleware for handling 404 errors (Route not found)
// This middleware is executed if no other routes match the incoming request
DCBA_SERVER.use((req, res, next) => {
    res.status(404).json({ statusMessage: 'Route not found' }); // Return 404 Not Found response
});

// Global Error Handling Middleware
// Handles errors that occur in other parts of the application
DCBA_SERVER.use((err, req, res, next) => {
    console.error(err.stack); // Log the error stack trace to the console
    res.status(500).json({ statusMessage: 'Internal Server Error' }); // Return 500 Internal Server Error response
});

/* ------------------------- INITIALIZE WEBSOCKET SERVER ------------------------- */

// Initialize WebSocket server by passing the HTTP server to the WebSocket library
const wss = new WebSocket.Server({ server });

// Initialize the WebSocket functionality with your utility function
initializeWebSocketServer(wss);
/* ------------------------- SERVER STARTUP ------------------------- */

// Get the server's port number from environment variables
const port = process.env.SERVER_INTERNAL_BIND_PORT; 
// Get the server's IP address from the configuration (bind to all interfaces in production or localhost in development)
const ip = config.ServerIPAddr; 
// Start the Express server and listen on the specified IP address and port
server.listen(port, ip, () => {
  console.log(`\n${magenta}============================= ${green}SERVER IS NOW LISTENING${reset} ${magenta}=============================\n${green}🔹 ${lightBlue}SERVER HOSTED AT:${reset} ${green}{ ${ip}:${port} } ${lightBlue}✔️ ${reset}\n${magenta}===================================================================================${reset}\n`);
});
