// Models/SystemConfig.js
const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
  {
    maintenanceNotice: {
      isActive: { type: Boolean, default: false },
      title: { type: String, default: '' },
      message: { type: String, default: '' },
      level: {
        type: String,
        enum: ['info', 'warning', 'critical'],
        default: 'warning',
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemConfig', systemConfigSchema);