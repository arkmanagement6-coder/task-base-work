const mongoose = require('mongoose');

const reviewVerificationSchema = new mongoose.Schema({
  submissionId: { type: String, required: true, index: true },
  scrapedReviewText: { type: String, required: true },
  scrapedReviewerName: { type: String, required: true },
  scrapedRating: { type: Number, required: true },
  scrapedDate: { type: Date, required: true },
  matchScore: { type: Number, required: true },
  processedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('ReviewVerification', reviewVerificationSchema);
