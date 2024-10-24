/*  Main entry point for the server. */

/* Main entry point for the server. */

const express = require('express');
const morgan = require('morgan');
const config = require('./config/config'); // Import configuration
const routes = require('./API/routes/routes'); // Import routes
const controller = require('./API/controllers/controller');
require('dotenv').config(); // Load environment variables
const fs = require('fs'); // Import file system module
const path = require('path'); // Import path module
const os = require('os'); 

const app = express();
app.use(express.json());
app.use(morgan('tiny')); // Enable request logging

// Create DATABASE directory if it doesn't exist
const dbDirectory = path.join(__dirname, 'DATABASE');
if (!fs.existsSync(dbDirectory)) {
    fs.mkdirSync(dbDirectory);
}

// Create workers.txt file if it doesn't exist
const workersFilePath = path.join(dbDirectory, 'workers.txt');
if (!fs.existsSync(workersFilePath)) {
    fs.writeFileSync(workersFilePath, ''); // Create the file
}

// Create ANDROID LOGS directory if it doesn't exist
const androidLogsDirectory = path.join(dbDirectory, 'ANDROID LOGS');
if (!fs.existsSync(androidLogsDirectory)) {
    fs.mkdirSync(androidLogsDirectory);
}

// Use the users routes
app.use('/users', routes);

// GET /server/status - Check server status
app.get('/server/status', controller.getServerStatus); // Get server status

// 404 Not Found Middleware
app.use((req, res, next) => {
    res.status(404).json({ message: 'Route not found' });
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
});

// Start the server
const port = process.env.SERVER_PORT || config.ServerBindPort;
const ip = config.ServerIPAddr; // Get the server's IP address
app.listen(port, () => {
    const magenta = '\x1b[35m'; // ANSI escape code for magenta
    const reset = '\x1b[0m';    // ANSI escape code to reset color
    console.log(`\n${magenta}[---------------------------------------------------------------------------------------------------------------------------------------- \SERVER is running on: [${ip}:${port}] ----------------------------------------------------------------------------------------------------------------------------------------]${reset}\n`);
});
