const mongoose = require('mongoose');

const schema_opts = {
  timestamps: true // Automatically adds `createdAt` and `updatedAt` fields
};

// Define the schema for the Device collection
const deviceSchema = new mongoose.Schema({
  device_id: {
    type: String,   // Store device_id as a string (hexadecimal or any format)
    required: true, // Ensure device_id is provided
    unique: true,   // Ensure device_id is unique
  },
  did: {
    type: String,   // Store DID as a string
    required: true, // Ensure DID is provided
  },
  sub: {
    type: String,   // Store sub as a string
    required: true, // Ensure sub is provided
  },
  log_file_uri: {
    type: String,   // Store log file URI as a string
    required: true, // Ensure log_file_uri is provided
  },
  heatmap: {
    type: Array,  // Define heatmap as an array
    default: []   // Set default value as an empty array
  },
  status: {
    type: String,  // Store status as a string
    enum: ['online', 'offline'],  // Only allow "online" or "offline" as valid values
    default: 'offline'  // Default value will be "offline"
  },
  last_coordinates: {
    lat: {
      type: Number,   // Latitude
      required: true, // Ensure latitude is provided
    },
    lon: {
      type: Number,   // Longitude
      required: true, // Ensure longitude is provided
    }
  },
  behavioural_score: {
    type: Number,
    min: 0,
    max: 1,
    default: 1 
  }
}, schema_opts);

// Create and export the Device model based on the schema
module.exports = mongoose.model('DEVICE', deviceSchema);
