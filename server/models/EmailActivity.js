import mongoose from 'mongoose';

const emailActivitySchema = new mongoose.Schema({
  // Email details
  emailId: {
    type: String,
    required: true,
    unique: true
  },
  businessId: {
    type: String,
    required: true
  },
  businessName: {
    type: String,
    required: true
  },
  decisionMakerId: {
    type: String,
    required: true
  },
  decisionMakerName: {
    type: String,
    required: true
  },
  decisionMakerEmail: {
    type: String,
    required: true
  },
  
  // Email content
  subject: {
    type: String,
    required: true
  },
  templateId: {
    type: String,
    required: true
  },
  templateName: {
    type: String,
    required: true
  },
  
  // Email status and tracking
  status: {
    type: String,
    enum: ['sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked', 'complained', 'unsubscribed'],
    default: 'sent'
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  deliveredAt: {
    type: Date
  },
  openedAt: {
    type: Date
  },
  clickedAt: {
    type: Date
  },
  bouncedAt: {
    type: Date
  },
  failedAt: {
    type: Date
  },
  
  // Tracking data
  openCount: {
    type: Number,
    default: 0
  },
  clickCount: {
    type: Number,
    default: 0
  },
  lastOpenedAt: {
    type: Date
  },
  lastClickedAt: {
    type: Date
  },
  
  // Email type
  emailType: {
    type: String,
    enum: ['test', 'real'],
    required: true
  },
  
  // Resend API data
  resendData: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Error information
  errorMessage: {
    type: String
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
emailActivitySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for efficient querying
emailActivitySchema.index({ businessId: 1 });
emailActivitySchema.index({ decisionMakerEmail: 1 });
emailActivitySchema.index({ status: 1 });
emailActivitySchema.index({ emailType: 1 });
emailActivitySchema.index({ sentAt: -1 });
emailActivitySchema.index({ createdAt: -1 });

const EmailActivity = mongoose.model('EmailActivity', emailActivitySchema);

export default EmailActivity; 