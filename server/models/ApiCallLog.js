import mongoose from 'mongoose';

const apiCallLogSchema = new mongoose.Schema({
  api: {
    type: String,
    required: true,
    enum: ['google_places_search', 'google_places_details', 'apollo_enrich', 'apollo_people_search', 'apollo_person_match']
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
});

apiCallLogSchema.index({ api: 1, timestamp: -1 });

const ApiCallLog = mongoose.model('ApiCallLog', apiCallLogSchema);

export default ApiCallLog;