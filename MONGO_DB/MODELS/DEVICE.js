const mongoose = require('mongoose');
const moment = require('moment-timezone');

// Get the current moment in UTC as a Date object
const getUTCDate = () => {
  return moment().utc().toDate();
};

const schema_opts = {
  timestamps: true // Automatically adds `createdAt` and `updatedAt` fields
};

// possibleLocations values
const possibleLocations = [
  'PACKAGING_LINES',
  'PERMITTED_AREA',
  'SORTING_LINES_1_TO_3',
  'SORTING_LINES_4_AND_5',
  'SORTING_LINES_6_TO_8',
  'WAREHOUSE',
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
  status: {
    type: String,  // Store status as a string
    enum: ['online', 'offline'],  // Only allow "online" or "offline" as valid values
    default: 'offline'  // Default value will be "offline"
  },
  location_history: {
    type: [locationEntrySchema],
    default: () => [{
      estimated_location: 'PERMITTED_AREA',
      first_seen_at: getUTCDate(),
      last_seen_at: getUTCDate(),
      duration_s: 0
    }]
  },
  behavioural_score: {
    type: Number,
    min: 0,
    max: 1,
    default: 1 
  },
  login_timestamp: {          
    type: Date,
    default: null       
  },
  restricted_areas: {
    type: [String],
    enum: possibleLocations,
    default: [] // Will be populated based on passport ids
  }
}, schema_opts);

// Prune location history to only keep entries from the last 10 days (in UTC)
deviceSchema.pre('save', function (next) {
  const TEN_DAYS_AGO = moment().utc().subtract(10, 'days').toDate();
  this.location_history = this.location_history.filter(entry => entry.first_seen_at > TEN_DAYS_AGO);
  next();
});

// Create and export the Device model based on the schema
module.exports = mongoose.model('DEVICE', deviceSchema);
