import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Resend } from 'resend';
import path from 'path';
import { fileURLToPath } from 'url';

import { initPuppeteer } from './utils.js';
import apiRoutes from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the server directory
dotenv.config({ path: path.join(__dirname, '.env') });

// Initialize Resend with API key, or use a mock if not available
let resend;
try {
  resend = new Resend(process.env.RESEND_API_KEY);
} catch (error) {
  console.log('[Server] Resend API key not found, using mock email service');
  resend = null;
}

const app = express();
const PORT = 3001;

// Debug mode for scraper
const DEBUG_SCRAPER = process.env.DEBUG_SCRAPER === 'true';
console.log(`[Server] Scraper debug mode: ${DEBUG_SCRAPER ? 'ENABLED' : 'disabled'}`);

// Database connection and models
let mongoose = null;

async function connectToDatabase() {
  try {
    // Connect to MongoDB
    const { default: mongooseModule } = await import('mongoose');
    mongoose = mongooseModule;
    
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/outreachpro';
    console.log(`[Server] Connecting to MongoDB: ${mongoUri.replace(/\/\/.*@/, '//***@')}`);
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      socketTimeoutMS: 45000,
    });
    
    console.log('[Server] MongoDB connected successfully');

    // --- Temporary script to drop obsolete collection ---
    try {
      const collections = await mongoose.connection.db.listCollections({ name: 'apollocontacts' }).toArray();
      if (collections.length > 0) {
        console.log('[Server] Obsolete "apollocontacts" collection found. Dropping it now...');
        await mongoose.connection.db.dropCollection('apollocontacts');
        console.log('[Server] Successfully dropped "apollocontacts" collection.');
      } else {
        console.log('[Server] Obsolete "apollocontacts" collection not found. No action needed.');
      }
    } catch (err) {
      console.error('[Server] Error dropping "apollocontacts" collection:', err);
    }
    // --- End of temporary script ---
    
    // Import models
    const { default: BusinessModel } = await import('./models/Business.js');
    const { default: CampaignModel } = await import('./models/Campaign.js');
    const { default: EmailTemplateModel } = await import('./models/EmailTemplate.js');
    const { default: EmailActivityModel } = await import('./models/EmailActivity.js');
    const { default: ApiCallLogModel } = await import('./models/ApiCallLog.js');
    
    // Business = BusinessModel; // Removed as per edit hint
    // Campaign = CampaignModel; // Removed as per edit hint
    // EmailTemplate = EmailTemplateModel; // Removed as per edit hint
    // EmailActivity = EmailActivityModel; // Removed as per edit hint
    // ApiCallLog = ApiCallLogModel; // Removed as per edit hint
    
    console.log('[Server] Database models loaded');
    
  } catch (error) {
    console.error('[Server] Failed to connect to MongoDB:', error.message);
    console.error('[Server] Please ensure MongoDB is running and accessible');
    process.exit(1);
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', (req, res, next) => {
  req.resend = resend;
  next();
}, apiRoutes);

// Serve static files from the React app
const buildPath = path.join(__dirname, '..', 'dist');
app.use(express.static(buildPath));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// Initialize puppeteer at startup
initPuppeteer().catch(err => {
  console.error('[Server] Failed to initialize Puppeteer:', err);
});

const startServer = async () => {
  await connectToDatabase();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();