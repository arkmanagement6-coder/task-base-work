const mongoose = require('mongoose');

const reviewLogSchema = new mongoose.Schema({
  action: { type: String, required: true }, // e.g., 'SUBMISSION_CREATED', 'SCRAPER_MATCHED', 'ADMIN_APPROVED', 'ADMIN_REJECTED'
  performedBy: { type: String, required: true }, // 'SYSTEM_CRON' or Admin ID
  submissionId: { type: String },
  details: { type: String, required: true },
  ipAddress: { type: String },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('ReviewLog', reviewLogSchema);
