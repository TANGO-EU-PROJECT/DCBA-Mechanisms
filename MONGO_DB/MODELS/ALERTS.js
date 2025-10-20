const mongoose = require('mongoose');
const moment = require('moment-timezone');

// Get the current moment in UTC as a Date object
const getUTCDate = () => {
  return moment().utc().toDate();
};

// Schema options to include `createdAt` and `updatedAt`
const schema_opts = {
  timestamps: true
};

// Allowed values for estimated_location (reuse from DEVICE schema)
const possibleLocations = [
  'PACKAGING_LINES',
  'PERMITTED_AREA',
  'SORTING_LINES_1_TO_3',
  'SORTING_LINES_4_AND_5',
  'SORTING_LINES_6_TO_8',
  'WAREHOUSE',
  // 'EKETA-OFFICE-204',
  // 'EKETA-OFFICE-201',
  // 'SERVER-ROOM',
  'UNKNOWN'
];

// Subschema for a location entry
const locationEntrySchema = new mongoose.Schema({
  estimated_location: {
    type: String,
    enum: possibleLocations,
    required: true
  },
  first_seen_at: {
    type: Date,
    required: true
  },
  last_seen_at: {
    type: Date,
    required: true
  },
  duration_s: {
    type: Number,
    default: 0
  }
}, { _id: false });

// Main Alert schema with a single location entry (not an array)
const alertSchema = new mongoose.Schema({
  device_id: {
    type: String,
    required: true
  },
  did: {
    type: String,
    required: true
  },
  alert_info: {   // changed from locations (array) to location (single doc)
    type: locationEntrySchema,
    required: true
  }
}, schema_opts); // Adds createdAt, updatedAt automatically

// Export the Alert model
module.exports = mongoose.model('ALERT', alertSchema);
