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
  category: {
    type: String,
    default: null
  },
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
  enrichedAt: {
    type: Date,
    default: null
  },
  numLocations: {
    type: Number,
    default: 1  // Default to 1 location for any business
  },
  locationNames: [{
    type: String
  }],
  icpScores: {
    midmarket: {
      score: { type: Number, default: null, min: 0, max: 10 },
      breakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
      lastCalculated: { type: Date, default: null }
    },
    independent: {
      score: { type: Number, default: null, min: 0, max: 10 },
      breakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
      lastCalculated: { type: Date, default: null }
    }
  },
  websiteAnalysis: {
    hasSEO: { type: Boolean, default: null },
    hasWhatsApp: { type: Boolean, default: null },
    hasReservation: { type: Boolean, default: null },
    hasDirectOrdering: { type: Boolean, default: null },
    hasThirdPartyDelivery: { type: Boolean, default: null },
    analyzedAt: { type: Date, default: null }
  },
  country: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better query performance
businessSchema.index({ placeId: 1 }, { unique: true });
businessSchema.index({ id: 1 }, { unique: true });
businessSchema.index({ addedAt: -1 });

// Virtual property to check if the business is enriched
businessSchema.virtual('isEnriched').get(function() {
  return !!this.enrichedAt || !!this.website || this.numLocations !== null;
});

const Business = mongoose.model('Business', businessSchema);

export default Business; 