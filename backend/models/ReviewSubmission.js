const mongoose = require('mongoose');

const reviewSubmissionSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true }, // custom unique string id
  candidateId: { type: String, required: true, index: true },
  candidateName: { type: String, required: true },
  taskId: { type: String, required: true, index: true },
  applicationName: { type: String, required: true },
  playStoreUrl: { type: String, required: true },
  reviewerName: { type: String, required: true }, // candidate's Google Play display name
  reviewText: { type: String, required: true },
  starRating: { type: Number, required: true, min: 1, max: 5 },
  screenshot: { type: String, required: true }, // secure file URL or base64 data
  status: { 
    type: String, 
    enum: ['Pending', 'Review Found', 'Verified', 'Rejected', 'Deleted By User'],
    default: 'Pending',
    index: true
  },
  matchScore: { type: Number, default: 0 },
  matchedReviewText: { type: String },
  matchedReviewerName: { type: String },
  matchedRating: { type: Number },
  matchedDate: { type: Date },
  rejectionReason: { type: String },
  date: { type: String, required: true } // Date string in format YYYY-MM-DD
}, { timestamps: true });

module.exports = mongoose.model('ReviewSubmission', reviewSubmissionSchema);
