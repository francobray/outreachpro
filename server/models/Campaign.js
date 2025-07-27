import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed'],
    default: 'draft'
  },
  businesses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business'
  }],
  emailTemplate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmailTemplate'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
campaignSchema.index({ id: 1 }, { unique: true });
campaignSchema.index({ status: 1 });
campaignSchema.index({ createdAt: -1 });

const Campaign = mongoose.model('Campaign', campaignSchema);

export default Campaign; 