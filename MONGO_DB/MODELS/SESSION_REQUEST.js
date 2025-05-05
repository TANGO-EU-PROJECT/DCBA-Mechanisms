// Import mongoose library for MongoDB object modeling
const mongoose = require('mongoose');

const schema_opts = {
  timestamps: true  // Automatically adds `createdAt` and `updatedAt` fields
};

// Define the schema for the Session Request collection
const sessionRequestSchema = new mongoose.Schema({
  device_id: {
    type: String,   // Store device_id as a string (hexadecimal)
    required: true, // Ensure device_id is provided
    unique: true,   // Ensure device_id is unique
  },
  qr_scanner_state_request: {
    type: String,   // Store qr_scanner_state_request as a string
    required: true, // Ensure qr_scanner_state_request is provided
  },
  log_file_uri: {
    type: String,   // Store log file URI as a string
    required: true, // Ensure log_file_uri is provided
  },
  createdAt: {
    type: Date,
    default: Date.now, // Automatically set the current date and time
    expires: 10        // Documents will expire after 10 seconds
  },
}, schema_opts);

// Create and export the SessionRequest model based on the schema
module.exports = mongoose.model('SESSION_REQUEST', sessionRequestSchema);
