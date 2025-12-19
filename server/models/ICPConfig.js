import mongoose from 'mongoose';

const icpFactorSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: true
  },
  weight: {
    type: Number,
    default: 1,
    min: 0,
    max: 10
  }
});

const icpConfigSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['midmarket', 'independent'],
    required: true
  },
  factors: {
    numLocations: {
      enabled: { type: Boolean, default: true },
      weight: { type: Number, default: 2, min: 0, max: 10 },
      minIdeal: { type: Number, default: 10 }, // For midmarket: 10+, For independent: 2
      maxIdeal: { type: Number, default: null } // For independent: 9, For midmarket: null (no max)
    },
    poorSEO: {
      enabled: { type: Boolean, default: true },
      weight: { type: Number, default: 2, min: 0, max: 10 }
    },
    hasWhatsApp: {
      enabled: { type: Boolean, default: true },
      weight: { type: Number, default: 2, min: 0, max: 10 }
    },
    hasReservation: {
      enabled: { type: Boolean, default: true },
      weight: { type: Number, default: 2, min: 0, max: 10 }
    },
    hasDirectOrdering: {
      enabled: { type: Boolean, default: true },
      weight: { type: Number, default: 1, min: 0, max: 10 }
    },
    geography: {
      enabled: { type: Boolean, default: true },
      weight: { type: Number, default: 1, min: 0, max: 10 }
    },
    isArgentina: {
      enabled: { type: Boolean, default: false },
      weight: { type: Number, default: 0, min: 0, max: 10 }
    },
    noWebsite: {
      enabled: { type: Boolean, default: false },
      weight: { type: Number, default: 0, min: 0, max: 10 }
    },
    deliveryIntensiveCategory: {
      enabled: { type: Boolean, default: true },
      weight: { type: Number, default: 3, min: 0, max: 10 }
    },
    bookingIntensiveCategory: {
      enabled: { type: Boolean, default: true },
      weight: { type: Number, default: 2, min: 0, max: 10 }
    }
  },
  deliveryCategories: {
    type: [String],
    default: ['Pizza', 'Hamburguesas', 'Sushi', 'Comida Mexicana', 'Comida Healthy', 'Milanesas', 'Empanadas']
  },
  bookingCategories: {
    type: [String],
    default: ['Bar', 'Craft Beer', 'Fine Dining']
  },
  targetCountries: {
    type: [String],
    default: ['Argentina']
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

const ICPConfig = mongoose.model('ICPConfig', icpConfigSchema);

export default ICPConfig;

