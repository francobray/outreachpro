import mongoose from 'mongoose';

const apolloContactSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  businessId: {
    type: String,
    required: true
  },
  placeId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    required: true
  },
  linkedin_url: {
    type: String,
    default: ''
  },
  email_status: {
    type: String,
    enum: ['verified', 'unverified'],
    default: 'unverified'
  },
  organization: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
apolloContactSchema.index({ id: 1 }, { unique: true });
apolloContactSchema.index({ businessId: 1 });
apolloContactSchema.index({ placeId: 1 });
apolloContactSchema.index({ email: 1 });
apolloContactSchema.index({ createdAt: -1 });

const ApolloContact = mongoose.model('ApolloContact', apolloContactSchema);

export default ApolloContact; 