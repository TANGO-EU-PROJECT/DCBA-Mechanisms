const mongoose = require('mongoose');

const deviceAccessMapSchema = new mongoose.Schema({
  ePassportId: {
    type: String,
    required: true,
    trim: true,
  },
  permittedAreas: {
    type: [String],
    default: [],
  },
  restrictedAreas: {
    type: [String],
    default: [],
  },
}, {
  timestamps: true,
});

const DeviceAccessMap = mongoose.model('DEVICE_ACCESS_MAP', deviceAccessMapSchema);

module.exports = DeviceAccessMap;
