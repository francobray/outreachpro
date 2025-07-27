import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema({
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
  subject: {
    type: String,
    required: true
  },
  html: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['outreach', 'follow-up', 'custom'],
    default: 'custom'
  },
  variables: [{
    name: String,
    description: String,
    defaultValue: String
  }],
  isDefault: {
    type: Boolean,
    default: false
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
emailTemplateSchema.index({ id: 1 }, { unique: true });
emailTemplateSchema.index({ category: 1 });
emailTemplateSchema.index({ isDefault: 1 });
emailTemplateSchema.index({ createdAt: -1 });

const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);

export default EmailTemplate; 