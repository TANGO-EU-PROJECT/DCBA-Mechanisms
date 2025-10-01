const mongoose = require('mongoose');

const debugLogSchema = new mongoose.Schema({
  device_id: { type: String, required: true },       // Which device generated the log
  did: { type: String },                             // DID of the employee associated with the device
  log_level: { type: String, enum: ['INFO', 'WARN', 'ERROR', 'DEBUG'], default: 'INFO' },
  message: { type: String, required: true },         // Log message
  stack: { type: String },                           // Error stack trace 
  app_version: { type: String },                     // Mobile app version 
  timestamp: { type: Date, default: Date.now },      // When the log was generated
  ip: { type: String }                               // Client IP 
});

// Index for fast lookups (device + recent logs first)
debugLogSchema.index({ device_id: 1, timestamp: -1 });

const DebugLogMessages = mongoose.model('DEBUG_LOGS', debugLogSchema);
module.exports = DebugLogMessages;
