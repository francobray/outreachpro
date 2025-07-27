import mongoose from 'mongoose';

const businessSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  address: {
    type: String,
    default: ''
  },
  website: {
    type: String,
    default: null
  },
  placeId: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    default: ''
  },
  emails: [{
    type: String
  }],
  auditReport: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  emailStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  types: [{
    type: String
  }],
  rating: {
    type: Number,
    default: null
  },
  userRatingsTotal: {
    type: Number,
    default: null
  },
  decisionMakers: [{
    name: String,
    title: String,
    email: String,
    linkedin_url: String,
    email_status: String
  }],
  apolloAttempted: {
    type: Boolean,
    default: false
  },
  enriched: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  numLocations: {
    type: Number,
    default: null
  },
  locationNames: [{
    type: String
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
businessSchema.index({ placeId: 1 }, { unique: true });
businessSchema.index({ id: 1 }, { unique: true });
businessSchema.index({ addedAt: -1 });

const Business = mongoose.model('Business', businessSchema);

export default Business; 