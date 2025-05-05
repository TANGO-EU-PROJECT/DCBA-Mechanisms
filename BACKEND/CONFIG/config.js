// Load environment variables from the .env file using the dotenv package
// This loads the environment variables defined in the '.env' file into process.env
require('dotenv').config({ path: '.env' });

// Exporting configuration settings as an object
module.exports = {
  // Determine the Server IP address based on the current environment (DEV or PROD)
  ServerIPAddr: process.env.NODE_ENV === 'DEV' 
    ? process.env.HOSTNAME_DEV // If in development mode, use HOSTNAME_DEV (localhost)
    : process.env.HOSTNAME_PROD // If not in development, use HOSTNAME_PROD (production server)
};
