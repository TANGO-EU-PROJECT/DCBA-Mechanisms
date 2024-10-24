/* Contains all configuration settings and constants. */

// config/config.js
require('dotenv').config({ path: '../.env' });

module.exports = {
  workers_file_path: process.env.workers_file_path,
  register_requests_file_path: process.env.register_requests_file_path,
  JWT_SECRET_KEY: process.env.JWT_SECRET_KEY,
  ServerBindPort: process.env.ServerBindPort || 3000, // Fallback to 3000 if not set
  ServerIPAddr: process.env.IP,
  feature_extractor_scripts_path: process.env.feature_extractor_scripts_path,
  localization_scripts_paths: process.env.localization_scripts_paths
};
