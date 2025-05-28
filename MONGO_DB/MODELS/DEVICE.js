const mongoose = require('mongoose');

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
  location: {
    type: String,
    enum: possibleLocations,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false }); // Disable _id for subdocuments

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
      location: 'PERMITTED_AREA',
      timestamp: moment().tz("Europe/Athens").toDate()
    }]
  },
  behavioural_score: {
    type: Number,
    min: 0,
    max: 1,
    default: 1 
  }
}, schema_opts);

// Prune location history to only keep entries from the last 2 days
deviceSchema.pre('save', function (next) {
  const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  this.location_history = this.location_history.filter(entry => entry.timestamp > TWO_DAYS_AGO);
  next();
});

// Create and export the Device model based on the schema
module.exports = mongoose.model('DEVICE', deviceSchema);
