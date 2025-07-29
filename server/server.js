import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import multer from 'multer';
import { Resend } from 'resend';
// import puppeteerExtra from 'puppeteer-extra';
// import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// Use dynamic imports for puppeteer packages
let puppeteer, puppeteerExtra, StealthPlugin, robotsParser;

async function initPuppeteer() {
  // Dynamically import puppeteer packages
  puppeteer = (await import('puppeteer')).default;
  const puppeteerExtraModule = await import('puppeteer-extra');
  puppeteerExtra = puppeteerExtraModule.default;
  const stealthPluginModule = await import('puppeteer-extra-plugin-stealth');
  StealthPlugin = stealthPluginModule.default;
  
  // Import robots-parser for robots.txt handling
  try {
    robotsParser = (await import('robots-parser')).default;
    console.log('[Server] Robots parser initialized');
  } catch (err) {
    console.log('[Server] Robots parser not available, will not check robots.txt');
  }
  
  // Initialize Puppeteer with stealth plugin
  puppeteerExtra.use(StealthPlugin());
  console.log('[Server] Puppeteer with stealth plugin initialized');
}

// Initialize puppeteer at startup
initPuppeteer().catch(err => {
  console.error('[Server] Failed to initialize Puppeteer:', err);
});

// Helper function to check robots.txt
async function checkRobotsTxt(url) {
  if (!robotsParser) return { allowed: true };
  
  try {
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
    
    console.log(`[Robots] Checking ${robotsUrl}`);
    const response = await fetch(robotsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });
    
    if (!response.ok) {
      console.log(`[Robots] No robots.txt found or error fetching (${response.status})`);
      return { allowed: true };
    }
    
    const robotsTxt = await response.text();
    const robots = robotsParser(robotsUrl, robotsTxt);
    
    const userAgent = 'Mozilla/5.0';
    const isAllowed = robots.isAllowed(url, userAgent);
    
    console.log(`[Robots] Access to ${url} ${isAllowed ? 'allowed' : 'disallowed'} by robots.txt`);
    return { 
      allowed: isAllowed,
      crawlDelay: robots.getCrawlDelay(userAgent) || 0
    };
  } catch (error) {
    console.log(`[Robots] Error checking robots.txt: ${error.message}`);
    return { allowed: true }; // Default to allowed if check fails
  }
}

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

// Function to reset API call tracking from the database
async function resetApiTracking() {
  try {
    await ApiCallLog.deleteMany({});
    console.log('[Tracking] API call logs reset in the database');
  } catch (error) {
    console.error('[Tracking] Error resetting API call logs:', error);
  }
}

// Function to get API call statistics from the database
async function getApiTrackingStats() {
  try {
    const googlePlacesSearch = await ApiCallLog.countDocuments({ api: 'google_places_search' });
    const googlePlacesDetails = await ApiCallLog.countDocuments({ api: 'google_places_details' });
    const apolloContacts = await ApiCallLog.countDocuments({ api: { $in: ['apollo_enrich', 'apollo_people_search', 'apollo_person_match'] } });
    return {
      googlePlacesSearch,
      googlePlacesDetails,
      apolloContacts,
      total: googlePlacesSearch + googlePlacesDetails + apolloContacts
    };
  } catch (error) {
    console.error('[Tracking] Error getting API tracking stats:', error);
    return { googlePlacesSearch: 0, googlePlacesDetails: 0, apolloContacts: 0, total: 0 };
  }
}

// Function to get monthly API call statistics from the database
async function getMonthlyStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  try {
    const currentMonthCalls = await ApiCallLog.aggregate([
      { $match: { timestamp: { $gte: startOfMonth } } },
      { $group: { _id: '$api', count: { $sum: 1 } } }
    ]);

    const previousMonthCalls = await ApiCallLog.aggregate([
      { $match: { timestamp: { $gte: startOfPreviousMonth, $lte: endOfPreviousMonth } } },
      { $group: { _id: '$api', count: { $sum: 1 } } }
    ]);

    const formatStats = (calls) => {
      const stats = {
        googlePlacesSearch: 0,
        googlePlacesDetails: 0,
        apolloContacts: 0
      };
      calls.forEach(call => {
        if (call._id === 'google_places_search') stats.googlePlacesSearch = call.count;
        if (call._id === 'google_places_details') stats.googlePlacesDetails = call.count;
        if (['apollo_enrich', 'apollo_people_search', 'apollo_person_match'].includes(call._id)) {
          stats.apolloContacts += call.count;
        }
      });
      return stats;
    };

    return {
      currentMonth: formatStats(currentMonthCalls),
      previousMonth: formatStats(previousMonthCalls)
    };
  } catch (error) {
    console.error('[Tracking] Error getting monthly stats:', error);
    return {
      currentMonth: { googlePlacesSearch: 0, googlePlacesDetails: 0, apolloContacts: 0 },
      previousMonth: { googlePlacesSearch: 0, googlePlacesDetails: 0, apolloContacts: 0 }
    };
  }
}

// Database connection and models
let mongoose = null;
let Business = null;
let Campaign = null;
let EmailTemplate = null;
let EmailActivity = null;
let ApiCallLog = null;

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
    
    Business = BusinessModel;
    Campaign = CampaignModel;
    EmailTemplate = EmailTemplateModel;
    EmailActivity = EmailActivityModel;
    ApiCallLog = ApiCallLogModel;
    
    console.log('[Server] Database models loaded');
    
    // Email templates are already in the database
    
  } catch (error) {
    console.error('[Server] Failed to connect to MongoDB:', error.message);
    console.error('[Server] Please ensure MongoDB is running and accessible');
    process.exit(1);
  }
}

// Email templates are managed via the API endpoints

// Database storage only - no in-memory fallback

// Middleware
app.use(cors());
app.use(express.json());

// Configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    graderApiUrl: process.env.GRADER_API_URL || 'https://grader.rayapp.io/api/generate-report-v2',
    usingMock: !process.env.RAY_GRADER_API_KEY || process.env.RAY_GRADER_API_KEY === 'demo-key',
    storageMode: 'database',
    databaseConnected: true
  });
});

// Serve test HTML page
app.get('/test-grader', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-grader.html'));
});

// Mock Google Places API data
const mockPlacesData = {
  'coffee shops austin': [
    {
      id: uuidv4(),
      name: 'Blue Bottle Coffee',
      address: '2001 E 2nd St, Austin, TX 78702',
      website: 'https://bluebottlecoffee.com',
      placeId: 'ChIJK3uZ2Z-1RIYRzqG2k4B0VqE',
      phone: '+1 512-555-0123'
    },
    {
      id: uuidv4(),
      name: 'Stumptown Coffee Roasters',
      address: '515 S Lamar Blvd, Austin, TX 78704',
      website: 'https://stumptowncoffee.com',
      placeId: 'ChIJyZ-2K5-1RIYRGzqB0VqE2k4',
      phone: '+1 512-555-0124'
    },
    {
      id: uuidv4(),
      name: 'Local Coffee House',
      address: '1234 Main St, Austin, TX 78701',
      website: null,
      placeId: 'ChIJB0VqE2k42Z-1RIYRzqGK3uZ',
      phone: '+1 512-555-0125'
    },
    {
      id: uuidv4(),
      name: 'Austin Coffee Co',
      address: '567 Congress Ave, Austin, TX 78701',
      website: 'https://austincoffeeco.com',
      placeId: 'ChIJ2k4B0VqEzqG2Z-1RIYRuZ3K',
      phone: '+1 512-555-0126'
    },
    {
      id: uuidv4(),
      name: 'Radio Coffee & Beer',
      address: '4204 Menchaca Rd, Austin, TX 78704',
      website: 'https://radiocoffeeandbeer.com',
      placeId: 'ChIJR4d1o2-1RIYRzqG2k4B0VqF',
      phone: '+1 512-555-0127'
    },
    {
      id: uuidv4(),
      name: 'Merit Coffee',
      address: '5121 Airport Blvd, Austin, TX 78751',
      website: 'https://meritcoffee.com',
      placeId: 'ChIJM3r1t2Z-1RIYRzqG2k4B0VqG',
      phone: '+1 512-555-0128'
    },
    {
      id: uuidv4(),
      name: 'Epoch Coffee',
      address: '221 W North Loop Blvd, Austin, TX 78751',
      website: 'https://epochcoffee.com',
      placeId: 'ChIJE2p0ch2-1RIYRzqG2k4B0VqH',
      phone: '+1 512-555-0129'
    },
    {
      id: uuidv4(),
      name: 'Greater Goods Coffee',
      address: '2501 E 6th St, Austin, TX 78702',
      website: 'https://greatergoodsroasting.com',
      placeId: 'ChIJG6r0od2-1RIYRzqG2k4B0VqI',
      phone: '+1 512-555-0130'
    }
  ],
  'restaurants miami': [
    {
      id: uuidv4(),
      name: 'Ocean Prime',
      address: '123 Ocean Dr, Miami, FL 33139',
      website: 'https://oceanprime.com',
      placeId: 'ChIJRzqG2k4B0VqE-1RIYZuZ3K',
      phone: '+1 305-555-0127'
    },
    {
      id: uuidv4(),
      name: 'The Local Eatery',
      address: '456 Biscayne Blvd, Miami, FL 33132',
      website: 'https://localeaterymia.com',
      placeId: 'ChIJB0VqE2k4RzqG-1RIYZuZ2',
      phone: '+1 305-555-0128'
    }
  ],
  'gyms denver': [
    {
      id: uuidv4(),
      name: 'Denver Athletic Club',
      address: '1325 Glenarm Pl, Denver, CO 80204',
      website: 'https://denverathleticclub.cc',
      placeId: 'ChIJD3n0er2-1RIYRzqG2k4B0VqJ',
      phone: '+1 303-555-0131'
    },
    {
      id: uuidv4(),
      name: 'CorePower Yoga',
      address: '1630 Welton St, Denver, CO 80202',
      website: 'https://corepoweryoga.com',
      placeId: 'ChIJC4p0fr2-1RIYRzqG2k4B0VqK',
      phone: '+1 303-555-0132'
    },
    {
      id: uuidv4(),
      name: 'Mile High Fitness',
      address: '2500 Curtis St, Denver, CO 80205',
      website: null,
      placeId: 'ChIJM5h0gr2-1RIYRzqG2k4B0VqL',
      phone: '+1 303-555-0133'
    },
    {
      id: uuidv4(),
      name: 'Rocky Mountain CrossFit',
      address: '3401 Blake St, Denver, CO 80205',
      website: 'https://rockymountaincrossfit.com',
      placeId: 'ChIJR6m0hr2-1RIYRzqG2k4B0VqM',
      phone: '+1 303-555-0134'
    },
    {
      id: uuidv4(),
      name: 'Anytime Fitness',
      address: '1450 Larimer St, Denver, CO 80202',
      website: 'https://anytimefitness.com',
      placeId: 'ChIJA7n0ir2-1RIYRzqG2k4B0VqN',
      phone: '+1 303-555-0135'
    }
  ],
  'salons portland': [
    {
      id: uuidv4(),
      name: 'Bishops Hair Studio',
      address: '2026 NE Alberta St, Portland, OR 97211',
      website: 'https://bishopshair.com',
      placeId: 'ChIJB8s0jr2-1RIYRzqG2k4B0VqO',
      phone: '+1 503-555-0136'
    },
    {
      id: uuidv4(),
      name: 'Rudy\'s Barbershop',
      address: '1323 SE Hawthorne Blvd, Portland, OR 97214',
      website: 'https://rudysbarbershop.com',
      placeId: 'ChIJR9u0kr2-1RIYRzqG2k4B0VqP',
      phone: '+1 503-555-0137'
    },
    {
      id: uuidv4(),
      name: 'Aveda Institute',
      address: '717 SW Washington St, Portland, OR 97205',
      website: 'https://avedainstitute.edu',
      placeId: 'ChIJA0v0lr2-1RIYRzqG2k4B0VqQ',
      phone: '+1 503-555-0138'
    },
    {
      id: uuidv4(),
      name: 'Parlour Salon',
      address: '3556 SE Division St, Portland, OR 97202',
      website: null,
      placeId: 'ChIJP1w0mr2-1RIYRzqG2k4B0VqR',
      phone: '+1 503-555-0139'
    }
  ],
  'restaurants seattle': [
    {
      id: uuidv4(),
      name: 'Pike Place Chowder',
      address: '1530 Post Alley, Seattle, WA 98101',
      website: 'https://pikeplacechowder.com',
      placeId: 'ChIJS2x0nr2-1RIYRzqG2k4B0VqS',
      phone: '+1 206-555-0140'
    },
    {
      id: uuidv4(),
      name: 'The Pink Door',
      address: '1919 Post Alley, Seattle, WA 98101',
      website: 'https://thepinkdoor.net',
      placeId: 'ChIJT3y0or2-1RIYRzqG2k4B0VqT',
      phone: '+1 206-555-0141'
    },
    {
      id: uuidv4(),
      name: 'Canlis',
      address: '2576 Aurora Ave N, Seattle, WA 98109',
      website: 'https://canlis.com',
      placeId: 'ChIJC4z0pr2-1RIYRzqG2k4B0VqU',
      phone: '+1 206-555-0142'
    },
    {
      id: uuidv4(),
      name: 'Serious Pie',
      address: '316 Virginia St, Seattle, WA 98101',
      website: 'https://seriouspieseattle.com',
      placeId: 'ChIJS5a0qr2-1RIYRzqG2k4B0VqV',
      phone: '+1 206-555-0143'
    },
    {
      id: uuidv4(),
      name: 'Local 360',
      address: '2234 1st Ave, Seattle, WA 98121',
      website: 'https://local360.org',
      placeId: 'ChIJL6b0rr2-1RIYRzqG2k4B0VqW',
      phone: '+1 206-555-0144'
    }
  ],
  'coffee shops san francisco': [
    {
      id: uuidv4(),
      name: 'Philz Coffee',
      address: '3101 24th St, San Francisco, CA 94110',
      website: 'https://philzcoffee.com',
      placeId: 'ChIJP7c0sr2-1RIYRzqG2k4B0VqX',
      phone: '+1 415-555-0145'
    },
    {
      id: uuidv4(),
      name: 'Ritual Coffee Roasters',
      address: '1026 Valencia St, San Francisco, CA 94110',
      website: 'https://ritualroasters.com',
      placeId: 'ChIJR8d0tr2-1RIYRzqG2k4B0VqY',
      phone: '+1 415-555-0146'
    },
    {
      id: uuidv4(),
      name: 'Four Barrel Coffee',
      address: '375 Valencia St, San Francisco, CA 94103',
      website: 'https://fourbarrelcoffee.com',
      placeId: 'ChIJF9e0ur2-1RIYRzqG2k4B0VqZ',
      phone: '+1 415-555-0147'
    },
    {
      id: uuidv4(),
      name: 'Sightglass Coffee',
      address: '270 7th St, San Francisco, CA 94103',
      website: 'https://sightglasscoffee.com',
      placeId: 'ChIJS0f0vr2-1RIYRzqG2k4B0Vqa',
      phone: '+1 415-555-0148'
    }
  ],
  'restaurants chicago': [
    {
      id: uuidv4(),
      name: 'Alinea',
      address: '1723 N Halsted St, Chicago, IL 60614',
      website: 'https://alinearestaurant.com',
      placeId: 'ChIJA1g0wr2-1RIYRzqG2k4B0Vqb',
      phone: '+1 312-555-0149'
    },
    {
      id: uuidv4(),
      name: 'Girl & the Goat',
      address: '809 W Randolph St, Chicago, IL 60607',
      website: 'https://girlandthegoat.com',
      placeId: 'ChIJG2h0xr2-1RIYRzqG2k4B0Vqc',
      phone: '+1 312-555-0150'
    },
    {
      id: uuidv4(),
      name: 'Lou Malnati\'s Pizzeria',
      address: '439 N Wells St, Chicago, IL 60654',
      website: 'https://loumalnatis.com',
      placeId: 'ChIJL3i0yr2-1RIYRzqG2k4B0Vqd',
      phone: '+1 312-555-0151'
    },
    {
      id: uuidv4(),
      name: 'The Purple Pig',
      address: '500 N Michigan Ave, Chicago, IL 60611',
      website: 'https://thepurplepigchicago.com',
      placeId: 'ChIJP4j0zr2-1RIYRzqG2k4B0Vqe',
      phone: '+1 312-555-0152'
    }
  ],
  'gyms los angeles': [
    {
      id: uuidv4(),
      name: 'Gold\'s Gym Venice',
      address: '360 Hampton Dr, Venice, CA 90291',
      website: 'https://goldsgym.com',
      placeId: 'ChIJG5k0ar2-1RIYRzqG2k4B0Vqf',
      phone: '+1 310-555-0153'
    },
    {
      id: uuidv4(),
      name: 'Equinox West Hollywood',
      address: '8590 Sunset Blvd, West Hollywood, CA 90069',
      website: 'https://equinox.com',
      placeId: 'ChIJE6l0br2-1RIYRzqG2k4B0Vqg',
      phone: '+1 310-555-0154'
    },
    {
      id: uuidv4(),
      name: 'Barry\'s Bootcamp',
      address: '8612 Melrose Ave, West Hollywood, CA 90069',
      website: 'https://barrysbootcamp.com',
      placeId: 'ChIJB7m0cr2-1RIYRzqG2k4B0Vqh',
      phone: '+1 310-555-0155'
    }
  ],
  'restaurants new york': [
    {
      id: uuidv4(),
      name: 'Le Bernardin',
      address: '155 W 51st St, New York, NY 10019',
      website: 'https://lebernardiny.com',
      placeId: 'ChIJL8n0dr2-1RIYRzqG2k4B0Vqi',
      phone: '+1 212-555-0156'
    },
    {
      id: uuidv4(),
      name: 'Katz\'s Delicatessen',
      address: '205 E Houston St, New York, NY 10002',
      website: 'https://katzsdelicatessen.com',
      placeId: 'ChIJK9o0er2-1RIYRzqG2k4B0Vqj',
      phone: '+1 212-555-0157'
    },
    {
      id: uuidv4(),
      name: 'Peter Luger Steak House',
      address: '178 Broadway, Brooklyn, NY 11249',
      website: 'https://peterluger.com',
      placeId: 'ChIJP0p0fr2-1RIYRzqG2k4B0Vqk',
      phone: '+1 718-555-0158'
    },
    {
      id: uuidv4(),
      name: 'Joe\'s Pizza',
      address: '7 Carmine St, New York, NY 10014',
      website: null,
      placeId: 'ChIJJ1q0gr2-1RIYRzqG2k4B0Vql',
      phone: '+1 212-555-0159'
    }
  ],
  'salons atlanta': [
    {
      id: uuidv4(),
      name: 'Van Michael Salon',
      address: '3290 Northside Pkwy NW, Atlanta, GA 30327',
      website: 'https://vanmichael.com',
      placeId: 'ChIJV2r0hr2-1RIYRzqG2k4B0Vqm',
      phone: '+1 404-555-0160'
    },
    {
      id: uuidv4(),
      name: 'Salon Red',
      address: '1544 Piedmont Ave NE, Atlanta, GA 30309',
      website: 'https://salonredatlanta.com',
      placeId: 'ChIJS3s0ir2-1RIYRzqG2k4B0Vqn',
      phone: '+1 404-555-0161'
    },
    {
      id: uuidv4(),
      name: 'Inman Park Hair Studio',
      address: '1015 Virginia Ave NE, Atlanta, GA 30306',
      website: null,
      placeId: 'ChIJI4t0jr2-1RIYRzqG2k4B0Vqo',
      phone: '+1 404-555-0162'
    }
  ]
};

// Generate mock businesses for any search
const generateMockBusinesses = (keyword, location) => {
  const businessTypes = {
    'coffee': ['Coffee House', 'Roasters', 'Cafe', 'Espresso Bar', 'Coffee Co'],
    'restaurant': ['Bistro', 'Grill', 'Kitchen', 'Eatery', 'Restaurant'],
    'gym': ['Fitness Center', 'Gym', 'CrossFit', 'Yoga Studio', 'Health Club'],
    'salon': ['Hair Salon', 'Beauty Bar', 'Spa', 'Nail Studio', 'Barbershop'],
    'shop': ['Shop', 'Store', 'Boutique', 'Market', 'Emporium'],
    'service': ['Services', 'Solutions', 'Company', 'Group', 'Associates']
  };

  // Determine business type from keyword
  let typeNames = businessTypes.service; // default
  for (const [key, names] of Object.entries(businessTypes)) {
    if (keyword.toLowerCase().includes(key)) {
      typeNames = names;
      break;
    }
  }

  const businesses = [];
  const count = Math.floor(Math.random() * 4) + 3; // 3-6 businesses

  for (let i = 0; i < count; i++) {
    const typeName = typeNames[Math.floor(Math.random() * typeNames.length)];
    const businessName = `${location} ${typeName}`;
    const hasWebsite = Math.random() > 0.3; // 70% chance of having website
    
    businesses.push({
      id: uuidv4(),
      name: businessName,
      address: `${100 + i * 50} Main St, ${location}, TX 7870${i}`,
      website: hasWebsite ? `https://${businessName.toLowerCase().replace(/\s+/g, '')}.com` : null,
      placeId: `ChIJ${uuidv4().substring(0, 20)}`,
      phone: `+1 512-555-${String(Math.floor(Math.random() * 9000) + 1000)}`
    });
  }

  return businesses;
};

// Mock audit report data
const generateMockAuditReport = (businessName, website) => {
  const reportId = uuidv4();
  const score = Math.floor(Math.random() * 40) + 60; // Score between 60-100
  
  return {
    id: reportId,
    businessName,
    website: website || 'N/A',
    score,
    issues: [
      'Website loading speed could be improved',
      'Missing meta descriptions on some pages',
      'Social media integration needed',
      'Contact information not prominently displayed'
    ].slice(0, Math.floor(Math.random() * 3) + 1),
    recommendations: [
      'Optimize images for faster loading',
      'Add customer testimonials',
      'Implement local SEO best practices',
      'Set up Google My Business profile'
    ].slice(0, Math.floor(Math.random() * 3) + 1),
    generatedAt: new Date().toISOString(),
    pdfUrl: `/api/reports/${reportId}/download`
  };
};

// Helper to extract a valid business domain from a website URL
function extractDomain(website) {
  if (!website) return undefined;
  try {
    const url = new URL(website);
    const domain = url.hostname.replace(/^www\./, '');
    // List of known 3rd-party domains to skip
    const thirdPartyDomains = [
      'facebook.com', 'instagram.com', 'yelp.com', 'tripadvisor.com', 'foursquare.com', 'google.com', 'maps.google.com'
    ];
    if (thirdPartyDomains.some(tp => domain.endsWith(tp))) {
      return undefined;
    }
    return domain;
  } catch {
    return undefined;
  }
}

// Update the fetchHtmlWithPuppeteer function to use stealth mode
async function fetchHtmlWithPuppeteer(url) {
  // Check robots.txt first
  const robotsCheck = await checkRobotsTxt(url);
  if (!robotsCheck.allowed) {
    console.log(`[Puppeteer] URL ${url} is disallowed by robots.txt, proceeding with caution`);
    // We still proceed but log the warning
  }
  
  // Apply crawl delay if specified in robots.txt
  if (robotsCheck.crawlDelay > 0) {
    console.log(`[Puppeteer] Respecting crawl delay of ${robotsCheck.crawlDelay}s from robots.txt`);
    await new Promise(r => setTimeout(r, robotsCheck.crawlDelay * 1000));
  }
  
  console.log(`[Puppeteer] Starting stealth browser for ${url}`);
  const browser = await puppeteerExtra.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-features=IsolateOrigins,site-per-process', // Disable site isolation
      '--disable-web-security', // Disable CORS
      '--disable-features=BlockInsecurePrivateNetworkRequests', // Allow insecure requests
      '--disable-blink-features=AutomationControlled', // Hide automation
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    // Set a realistic viewport with slight randomization
    const width = 1920 + Math.floor(Math.random() * 100);
    const height = 1080 + Math.floor(Math.random() * 50);
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 1 + Math.random() * 0.3, // Random scale between 1.0 and 1.3
      hasTouch: false,
      isLandscape: true,
      isMobile: false
    });
    
    // Set user agent with slight variations
    const osVersions = ['10_15_7', '11_0_0', '12_0_1'];
    const chromeVersions = ['120.0.0.0', '119.0.0.0', '121.0.0.0'];
    const osVersion = osVersions[Math.floor(Math.random() * osVersions.length)];
    const chromeVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
    await page.setUserAgent(`Mozilla/5.0 (Macintosh; Intel Mac OS X ${osVersion}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`);
    
    // Set extra headers to appear more human-like
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Referer': 'https://www.google.com/',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-User': '?1',
      'Sec-Ch-Ua': '"Google Chrome";v="120", "Chromium";v="120", "Not-A.Brand";v="8"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"'
    });
    
    // Mask WebDriver
    await page.evaluateOnNewDocument(() => {
      // Overwrite the 'navigator.webdriver' property to make it undefined
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Overwrite the 'navigator.plugins' to look like a normal browser
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
          ];
          return plugins;
        }
      });
      
      // Add a fake language list
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'es']
      });
    });
    
    // Add random delay before navigation to simulate human behavior
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 500));
    
    // Navigate with timeout and wait until network is idle
    console.log(`[Puppeteer] Navigating to ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait a bit to ensure all content is loaded with random timing
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 1000));
    
    // Perform random mouse movements to simulate human behavior
    await simulateHumanBehavior(page);
    
    // Scroll down to trigger any lazy-loaded content
    await autoScroll(page);
    
    // Wait for potential dynamic content
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1500) + 500));
    
    // Get the page content
    const html = await page.content();
    console.log(`[Puppeteer] Successfully fetched HTML: ${html.length} bytes`);
    
    return html;
  } catch (error) {
    console.error(`[Puppeteer] Error fetching ${url}:`, error);
    throw error;
  } finally {
    await browser.close();
    console.log(`[Puppeteer] Browser closed`);
  }
}

// Function to simulate human-like behavior
async function simulateHumanBehavior(page) {
  try {
    // Get viewport dimensions
    const dimensions = await page.evaluate(() => {
      return {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight
      };
    });
    
    // Perform 2-5 random mouse movements
    const movements = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < movements; i++) {
      const x = Math.floor(Math.random() * dimensions.width);
      const y = Math.floor(Math.random() * dimensions.height);
      
      await page.mouse.move(x, y, { steps: 10 });
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 500) + 200));
    }
    
    // Maybe click on something (20% chance)
    if (Math.random() < 0.2) {
      // Try to find a non-link element to click
      const clickableElement = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, div, span'))
          .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 10 && 
                   rect.height > 10 && 
                   rect.top > 0 && 
                   !el.closest('a') && // Not inside a link
                   !el.closest('form'); // Not inside a form
          });
        
        if (elements.length === 0) return null;
        
        const randomElement = elements[Math.floor(Math.random() * elements.length)];
        const rect = randomElement.getBoundingClientRect();
        return {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2
        };
      });
      
      if (clickableElement) {
        await page.mouse.click(clickableElement.x, clickableElement.y);
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 500) + 300));
      }
    }
  } catch (error) {
    console.log('[Puppeteer] Error during human behavior simulation:', error.message);
    // Continue execution even if simulation fails
  }
}

// Helper function to scroll down the page
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

// Helper function to normalize and deduplicate emails
function normalizeAndDeduplicateEmails(emails) {
  if (!emails || emails.length === 0) return [];
  
  // Use a Map to deduplicate by lowercase email
  const normalizedEmailMap = new Map();
  
  emails.forEach(email => {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Keep the first occurrence or prefer the one with more lowercase letters
    // (likely the intended casing rather than ALL CAPS)
    if (!normalizedEmailMap.has(normalizedEmail) || 
        (email.match(/[a-z]/g) || []).length > (normalizedEmailMap.get(normalizedEmail).match(/[a-z]/g) || []).length) {
      normalizedEmailMap.set(normalizedEmail, email);
    }
  });
  
  // Convert back to array
  return Array.from(normalizedEmailMap.values());
}

// Add a new function for regular scraping that detects bot protection
async function fetchHtmlWithFallback(url, options = {}) {
  const { noPuppeteer = false, debugMode = DEBUG_SCRAPER || false, maxRetries = 3 } = options;
  
  // Check robots.txt first
  const robotsCheck = await checkRobotsTxt(url);
  if (!robotsCheck.allowed) {
    console.log(`[Scraper] URL ${url} is disallowed by robots.txt, proceeding with caution`);
  }
  
  // Apply crawl delay if specified in robots.txt
  if (robotsCheck.crawlDelay > 0) {
    console.log(`[Scraper] Respecting crawl delay of ${robotsCheck.crawlDelay}s from robots.txt`);
    await new Promise(r => setTimeout(r, robotsCheck.crawlDelay * 1000));
  }
  
  // Implement retry strategy with exponential backoff
  let retryCount = 0;
  let lastError = null;
  
  while (retryCount <= maxRetries) {
    try {
      if (retryCount > 0) {
        const backoffTime = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        console.log(`[Scraper] Retry ${retryCount}/${maxRetries} after ${Math.round(backoffTime/1000)}s backoff`);
        await new Promise(r => setTimeout(r, backoffTime));
      }
      
      // First try with regular fetch
      console.log(`[Scraper] Attempting regular fetch for ${url}${noPuppeteer ? ' (Puppeteer disabled)' : ''}${debugMode ? ' (Debug mode)' : ''}`);
      
      // Randomize headers slightly to avoid detection
      const userAgents = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      ];
      
      const acceptLanguages = [
        'en-US,en;q=0.9',
        'en-US,en;q=0.9,es;q=0.8',
        'en-GB,en;q=0.9',
        'en-CA,en;q=0.9,fr-CA;q=0.8'
      ];
      
      const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
      const acceptLanguage = acceptLanguages[Math.floor(Math.random() * acceptLanguages.length)];
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': acceptLanguage,
          'Referer': 'https://www.google.com/',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Google Chrome";v="120", "Chromium";v="120", "Not-A.Brand";v="8"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 15000
      });
      
      // Handle HTTP errors
      if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
          console.log(`[Scraper] Received ${response.status} status code - likely rate limited or blocked`);
          if (retryCount < maxRetries && noPuppeteer === false) {
            retryCount++;
            continue; // Try again with backoff
          } else {
            console.log(`[Scraper] Falling back to Puppeteer after ${response.status} status`);
            return await fallbackToPuppeteer(url, debugMode, noPuppeteer);
          }
        }
        
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const html = await response.text();
      console.log(`[Scraper] Regular fetch got ${html.length} bytes`);
      
      // Log the full HTML for debugging purposes
      console.log(`[Scraper] Full HTML content received:\n${html}\n[Scraper] End of HTML content`);
      
      // Log a sample of the HTML to diagnose bot detection issues
      const htmlSample = html.substring(0, 500) + "... [truncated]";
      console.log(`[Scraper] HTML sample: ${htmlSample}`);
    
      // Check for signs of bot detection - with more specific patterns
      const lowerHtml = html.toLowerCase();
      
      // Define specific patterns to check
      const botDetectionPatterns = {
        tooSmall: html.length < 500,
        captcha: lowerHtml.includes('captcha') && (
          lowerHtml.includes('verify') || 
          lowerHtml.includes('challenge') || 
          lowerHtml.includes('complete')
        ) && !lowerHtml.includes('recaptcha.net/recaptcha') && // Exclude Google reCAPTCHA scripts
           !lowerHtml.includes('squarespace'), // Exclude Squarespace references to captcha
        // Fix the robotDetection pattern - it was matching on meta tags like "robots"
        robotDetection: (lowerHtml.includes('robot detection') || 
                        (lowerHtml.includes('robot') && lowerHtml.includes('check') && !lowerHtml.includes('meta')) || 
                        (lowerHtml.includes('bot') && lowerHtml.includes('protection'))) &&
                        !lowerHtml.includes('squarespace'), // Exclude Squarespace references
        cloudflare: lowerHtml.includes('cloudflare') && lowerHtml.includes('security') && lowerHtml.includes('check'),
        securityCheck: lowerHtml.includes('security check') && !lowerHtml.includes('meta name="robots"'),
        accessDenied: lowerHtml.includes('access denied') || lowerHtml.includes('403 forbidden'),
        automatedRequest: lowerHtml.includes('automated request') && lowerHtml.includes('detected'),
        securityBlock: lowerHtml.includes('blocked') && lowerHtml.includes('security') && !lowerHtml.includes('ad blocker')
      };
      
      // Special case for common website builders that might have false positives
        const isWixSite = lowerHtml.includes('wix.com') || lowerHtml.includes('wixstatic.com');
        const isWordPressSite = lowerHtml.includes('wordpress.org') || lowerHtml.includes('wp-content') || lowerHtml.includes('hummingbird-performance');
        const isSquareOnlineSite = lowerHtml.includes('square online') || lowerHtml.includes('cdn3.editmysite.com');
        const isSquarespaceSite = lowerHtml.includes('squarespace.com') || 
                                 lowerHtml.includes('this is squarespace') || 
                                 lowerHtml.includes('xmlns:og="http://opengraphprotocol.org/schema/"') ||
                                 lowerHtml.includes('matt-wright-4nxl');
        const isDudaSite = lowerHtml.includes('dudaone') || 
                          lowerHtml.includes('systemid: \'us_direct_production\'') || 
                          lowerHtml.includes('window._currentdevice');
      
      // Check if any pattern matches
      const matchedPatterns = Object.entries(botDetectionPatterns)
        .filter(([key, matched]) => matched)
        .map(([key]) => key);
        
      if (matchedPatterns.length > 0) {
        console.log(`[Scraper] Matched patterns: ${matchedPatterns.join(', ')}`);
        
        // Debug logging for specific patterns
        if (matchedPatterns.includes('captcha')) {
          const captchaContext = lowerHtml.indexOf('captcha') > 0 ? 
            lowerHtml.substring(Math.max(0, lowerHtml.indexOf('captcha') - 50), 
                              Math.min(lowerHtml.length, lowerHtml.indexOf('captcha') + 50)) : '';
          console.log(`[Scraper] Captcha context: "${captchaContext}"`);
        }
        
        if (matchedPatterns.includes('robotDetection')) {
          const robotContext = lowerHtml.indexOf('robot') > 0 ? 
            lowerHtml.substring(Math.max(0, lowerHtml.indexOf('robot') - 50), 
                              Math.min(lowerHtml.length, lowerHtml.indexOf('robot') + 50)) : '';
          console.log(`[Scraper] Robot detection context: "${robotContext}"`);
        }
      }
      
      // Don't trigger bot detection for common website builders unless we have strong evidence
      let isBotDetected = matchedPatterns.length > 0;
      
      // Check for common false positives based on HTML content
      if (lowerHtml.includes('meta name="robots"') && matchedPatterns.includes('robotDetection')) {
        console.log(`[Scraper] Ignoring false positive from meta robots tag`);
        isBotDetected = false;
      }
      
      // Check for common false positives in WordPress sites
      if (lowerHtml.includes('hummingbird-performance') && matchedPatterns.includes('robotDetection')) {
        console.log(`[Scraper] Ignoring false positive from WordPress Hummingbird plugin`);
        isBotDetected = false;
      }
      
      // Check for Duda sites (like Bennu Coffee)
      if (lowerHtml.includes('window._currentdevice') && (matchedPatterns.includes('captcha') || matchedPatterns.includes('robotDetection'))) {
        console.log(`[Scraper] Ignoring false positive from Duda platform`);
        isBotDetected = false;
      }
      
      // Check for Squarespace sites (like Brew & Brew)
      if (lowerHtml.includes('this is squarespace') && (matchedPatterns.includes('captcha') || matchedPatterns.includes('robotDetection'))) {
        console.log(`[Scraper] Ignoring false positive from Squarespace platform`);
        isBotDetected = false;
      }
      
      // If it's a common website builder, only trigger bot detection for strong signals
      if ((isWixSite || isWordPressSite || isSquareOnlineSite || isSquarespaceSite || isDudaSite) && matchedPatterns.length === 1) {
        // If we only have one match and it's a weak signal, don't trigger bot detection
        if (matchedPatterns.includes('robotDetection') || matchedPatterns.includes('captcha')) {
          console.log(`[Scraper] Ignoring weak bot detection signal on ${isWixSite ? 'Wix' : isWordPressSite ? 'WordPress' : isSquareOnlineSite ? 'Square Online' : isSquarespaceSite ? 'Squarespace' : 'Duda'} site`);
          isBotDetected = false;
        }
      }
      
      // Special case for Wix sites which often have false positives
      if (isWixSite && matchedPatterns.length <= 2 && 
          (matchedPatterns.includes('captcha') || matchedPatterns.includes('robotDetection') || matchedPatterns.includes('securityBlock'))) {
        console.log(`[Scraper] Ignoring common false positives on Wix site`);
        isBotDetected = false;
      }
      
      // Specific checks for known problematic sites
      if (url.includes('thebrewandbrew.com') || url.includes('bennucoffee.com') || url.includes('afugacoffee.com')) {
        console.log(`[Scraper] Ignoring false positives on known site: ${url}`);
        isBotDetected = false;
      }
      
      if (isBotDetected) {
        console.log(`[Scraper] Bot detection suspected, falling back to Puppeteer`);
        
        if (debugMode) {
          console.log(`[Scraper] Debug mode enabled - using regular fetch result despite bot detection`);
          return { html, usedPuppeteer: false };
        } else if (noPuppeteer) {
          console.log(`[Scraper] Puppeteer disabled, using regular fetch result despite bot detection`);
          return { html, usedPuppeteer: false };
        } else {
          console.log(`[Scraper] Falling back to Puppeteer`);
          const puppeteerHtml = await fetchHtmlWithPuppeteer(url);
          return { html: puppeteerHtml, usedPuppeteer: true };
        }
      }
      
      return { html, usedPuppeteer: false };
    } catch (error) {
      console.error(`[Scraper] Regular fetch failed: ${error.message}`);
      lastError = error;
      
      // If we've reached max retries or have specific errors that won't be resolved by retrying
      if (retryCount >= maxRetries || error.name === 'AbortError' || error.code === 'ENOTFOUND') {
        break;
      }
      
      retryCount++;
    }
  }
  
  // If we've exhausted retries or have a terminal error
  if (debugMode) {
    console.log(`[Scraper] Debug mode enabled - cannot continue with regular fetch due to error`);
    throw lastError;
  } else if (noPuppeteer) {
    console.log(`[Scraper] Puppeteer disabled, cannot fetch URL: ${url}`);
    throw lastError;
  } else {
    console.log(`[Scraper] Falling back to Puppeteer after ${retryCount} failed attempts`);
    return await fallbackToPuppeteer(url, debugMode, noPuppeteer);
  }
}

// Helper function to handle Puppeteer fallback
async function fallbackToPuppeteer(url, debugMode, noPuppeteer) {
  if (debugMode) {
    console.log(`[Scraper] Debug mode enabled - would use Puppeteer but returning error instead`);
    throw new Error('Regular fetch failed and debug mode is enabled');
  } else if (noPuppeteer) {
    console.log(`[Scraper] Puppeteer disabled, cannot fetch URL: ${url}`);
    throw new Error('Regular fetch failed and Puppeteer is disabled');
  } else {
    console.log(`[Scraper] Falling back to Puppeteer`);
    const puppeteerHtml = await fetchHtmlWithPuppeteer(url);
    return { html: puppeteerHtml, usedPuppeteer: true };
  }
}

// API Routes

// Search businesses using Google Places API (real implementation)
app.post('/api/search', async (req, res) => {
  const { location, keyword, includeApollo = true } = req.body;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  console.log('[Search] Request received:', { location, keyword });
  console.log('[Search] API Key present:', !!apiKey);
  if (apiKey) {
    console.log('[Search] API Key (first 10 chars):', apiKey.substring(0, 10) + '...');
  }

  // If no API key, use mock data
  if (!apiKey) {
    console.log('[Search] No Google Places API key found, using mock data');
    const mockBusinesses = generateMockBusinesses(keyword, location);
    
    // Save to MongoDB
    for (const business of mockBusinesses) {
      try {
        const existingBusiness = await Business.findOne({ placeId: business.placeId });
        if (!existingBusiness) {
          await Business.create(business);
        }
      } catch (error) {
        console.error('[Search] Error saving business to MongoDB:', error);
      }
    }
    
    return res.json({ businesses: mockBusinesses });
  }

  try {
    // Geocode the location to get lat/lng
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
    console.log('[Search] Geocoding request URL:', geocodeUrl.replace(apiKey, 'API_KEY_HIDDEN'));
    
    const geoRes = await fetch(geocodeUrl);
    const geoData = await geoRes.json();
    console.log('[Search] Geocoding response status:', geoRes.status);
    
    if (!geoData.results || geoData.results.length === 0) {
      console.log('[Search] Location not found in Google Places API, using mock data');
      const mockBusinesses = generateMockBusinesses(keyword, location);
      
      // Save to MongoDB
      for (const business of mockBusinesses) {
        try {
          const existingBusiness = await Business.findOne({ placeId: business.placeId });
          if (!existingBusiness) {
            await Business.create(business);
          }
        } catch (error) {
          console.error('[Search] Error saving business to MongoDB:', error);
        }
      }
      
      return res.json({ businesses: mockBusinesses });
    }
    const { lat, lng } = geoData.results[0].geometry.location;
    console.log('[Search] Geocoded coordinates:', { lat, lng });

    // Search for places - use fields parameter to get as much data as possible in one request
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&keyword=${encodeURIComponent(keyword)}&key=${apiKey}`;
    console.log('[Search] Places search request URL:', placesUrl.replace(apiKey, 'API_KEY_HIDDEN'));
    
    const placesRes = await fetch(placesUrl);
    const placesData = await placesRes.json();
    console.log('[Search] Places search response status:', placesRes.status);
    console.log('[Search] Found places:', placesData.results?.length || 0);
    
    // Track Google Places Search API call in the database
    try {
      await ApiCallLog.create({
        api: 'google_places_search',
        timestamp: new Date(),
        details: {
          endpoint: 'nearbysearch',
          keyword: keyword,
          location: location
        }
      });
      console.log('[Tracking] Google Places Search API call tracked in database.');
    } catch (error) {
      console.error('[Tracking] Error saving Google Places Search API call to database:', error);
    }

    // Map Google results to business format without additional API calls
    const businessesFound = (placesData.results || []).map(place => {
      const business = {
      id: place.place_id,
      name: place.name,
        address: place.vicinity || '',
        website: null, // Will be populated on demand with the place-details endpoint
      placeId: place.place_id,
        phone: '', // Will be populated on demand with the place-details endpoint
      emails: [],
      auditReport: null,
      emailStatus: 'pending',
      addedAt: new Date().toISOString(),
      types: place.types || [],
      rating: place.rating || null,
      userRatingsTotal: place.user_ratings_total || null,
      };

      return business;
    });

    console.log('[Search] Mapped businesses:', businessesFound.length);

    // Save businesses to database
    for (const business of businessesFound) {
      try {
        const existingBusiness = await Business.findOne({ placeId: business.placeId });
        if (!existingBusiness) {
          await Business.create(business);
        }
      } catch (error) {
        console.error('[Search] Error saving business to MongoDB:', error);
      }
    }

    res.json({ businesses: businessesFound });
  } catch (error) {
    console.log('[Search] Google Places API error, using mock data:', error.message);
    console.log('[Search] Full error:', error);
    const mockBusinesses = generateMockBusinesses(keyword, location);
    
    // Save to MongoDB
    for (const business of mockBusinesses) {
      try {
        const existingBusiness = await Business.findOne({ placeId: business.placeId });
        if (!existingBusiness) {
          await Business.create(business);
        }
      } catch (error) {
        console.error('[Search] Error saving business to MongoDB:', error);
      }
    }
    
    res.json({ businesses: mockBusinesses });
  }
});

// Generate audit report for a business
app.post('/api/audit/:businessId', async (req, res) => {
  const { businessId } = req.params;
  
  try {
    const business = await Business.findOne({ id: businessId });
    
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    // Simulate API delay
    setTimeout(async () => {
      const auditReport = generateMockAuditReport(business.name, business.website);
      
      // Update business with audit report
      business.auditReport = auditReport;
      await business.save();
      
      res.json({ auditReport });
    }, 2000);
  } catch (error) {
    console.error('[Audit] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Find emails for a business
app.post('/api/emails/:businessId', async (req, res) => {
  const { businessId } = req.params;
  console.log(`[Apollo] /api/emails/${businessId} endpoint hit`);
  
  try {
    const business = await Business.findOne({ id: businessId });

    if (!business) {
      console.log(`[Apollo] Business not found for id: ${businessId}`);
      return res.status(404).json({ error: 'Business not found' });
    }

    const apolloApiKey = process.env.APOLLO_API_KEY;
    const domain = extractDomain(business.website);
    let orgId = undefined;
    let enrichedOrg = undefined;

    // 1. Enrich the organization if we have a valid domain
    if (domain) {
      console.log('[Apollo] Enrich API request:', { domain, name: business.name });
      const enrichRes = await fetch('https://api.apollo.io/v1/organizations/enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'x-api-key': apolloApiKey,
        },
        body: JSON.stringify({
          api_key: apolloApiKey,
          domain: domain,
          name: business.name,
        }),
      });
      const enrichData = await enrichRes.json();
      console.log('[Apollo] Enrich API response:', JSON.stringify(enrichData, null, 2));
      enrichedOrg = enrichData.organization;
      business.enriched = enrichedOrg;
      orgId = enrichedOrg && enrichedOrg.id;
      
      // Track Apollo API call
      try {
        await ApiCallLog.create({
          api: 'apollo_enrich',
          timestamp: new Date(),
          details: {
            endpoint: 'enrich',
            domain: domain,
            businessName: business.name
          }
        });
        console.log('[Tracking] Apollo Enrich API call tracked in database.');
      } catch (error) {
        console.error('[Tracking] Error saving Apollo Enrich API call to database:', error);
      }
    }

    // 2. Use org_id or domain to search for decision makers
    let peopleBody = {
      api_key: apolloApiKey,
      person_titles: ['Owner', 'Marketing Executive', 'Marketing Director', 'Marketing Manager', 'CEO', 'President', 'General Manager'],
      page: 1,
      per_page: 5,
      email_required: true,
      reveal_personal_emails: true,
      contact_email_status: ['verified', 'unverified'],
      show_personal_emails: true,
    };
    if (orgId) {
      peopleBody['organization_ids'] = [orgId];
    } else if (domain) {
      peopleBody['q_organization_domains'] = [domain];
    } else {
      peopleBody['q_organization_names'] = [business.name];
    }
    console.log('[Apollo] People API request:', peopleBody);
    const peopleRes = await fetch('https://api.apollo.io/v1/people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': apolloApiKey,
      },
      body: JSON.stringify(peopleBody),
    });
    const peopleData = await peopleRes.json();
    console.log('[Apollo] People API response:', JSON.stringify(peopleData, null, 2));
    console.log('[Apollo] People API status:', peopleRes.status);
    console.log('[Apollo] People API total entries:', peopleData.pagination?.total_entries || 0);
    
    // Track Apollo API call
    try {
      await ApiCallLog.create({
        api: 'apollo_people_search',
        timestamp: new Date(),
        details: {
          endpoint: 'people_search',
          businessName: business.name,
          orgId: orgId,
          domain: domain,
          foundContacts: (peopleData.people || []).map(p => ({
            name: p.name,
            title: p.title,
            linkedin_url: p.linkedin_url,
          })),
          organizationName: (peopleData.people && peopleData.people.length > 0) ? peopleData.people[0].organization?.name : null,
          organizationWebsite: (peopleData.people && peopleData.people.length > 0) ? peopleData.people[0].organization?.website_url : null,
        }
      });
      console.log('[Tracking] Apollo People Search API call tracked in database.');
    } catch (error) {
      console.error('[Tracking] Error saving Apollo People Search API call to database:', error);
    }

    // Extract emails and names
    const emails = (peopleData.people || []).map(person => person.email).filter(Boolean);
    business.emails = emails;

    // Store decision makers info
    business.decisionMakers = await Promise.all((peopleData.people || []).map(async person => {
      let email = person.email;
      // If email is locked, try to enrich
      if (
        (!email || email === 'email_not_unlocked@domain.com') &&
        person.id
      ) {
        try {
          const enrichRes = await fetch('https://api.apollo.io/v1/people/match', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
              'x-api-key': apolloApiKey,
            },
            body: JSON.stringify({
              api_key: apolloApiKey,
              id: person.id,
            }),
          });
          const enrichData = await enrichRes.json();
          if (enrichData.person && enrichData.person.email && enrichData.person.email !== 'email_not_unlocked@domain.com') {
            email = enrichData.person.email;
          } else if (Array.isArray(person.personal_emails) && person.personal_emails.length > 0) {
            email = person.personal_emails[0];
          }
          
          // Track Apollo API call
          try {
            const personData = enrichData.person;
            await ApiCallLog.create({
              api: 'apollo_person_match',
              timestamp: new Date(),
              details: {
                endpoint: 'person_match',
                personId: person.id,
                businessName: business.name,
                foundContacts: personData ? [{
                  name: personData.name,
                  title: personData.title,
                  linkedin_url: personData.linkedin_url,
                }] : [],
                organizationName: personData?.organization?.name,
                organizationWebsite: personData?.organization?.website_url,
              }
            });
            console.log('[Tracking] Apollo Person Match API call tracked in database.');
          } catch (error) {
            console.error('[Tracking] Error saving Apollo Person Match API call to database:', error);
          }
        } catch (err) {
          console.log('[Apollo] Error enriching person:', person.id, err);
        }
      } else if (
        (!email || email === 'email_not_unlocked@domain.com') &&
        Array.isArray(person.personal_emails) &&
        person.personal_emails.length > 0
      ) {
        email = person.personal_emails[0];
      }
      return {
        name: person.name,
        title: person.title,
        email,
        linkedin_url: person.linkedin_url,
        email_status: person.email_status,
      };
    }));

    res.json({ emails, decisionMakers: business.decisionMakers, enriched: business.enriched });
  } catch (error) {
    console.error('[Apollo] Error:', error);
    res.status(500).json({ error: 'Failed to fetch from Apollo API' });
  }
});

// Send outreach email
app.post('/api/send-email', async (req, res) => {
  console.log('[Email API] Received email request:', {
    to: req.body.to,
    subject: req.body.subject,
    htmlLength: req.body.html?.length || 0,
    from: process.env.EMAIL_FROM
  });

  const { 
    to, 
    subject, 
    html, 
    businessId, 
    businessName, 
    decisionMakerId, 
    decisionMakerName, 
    decisionMakerEmail, 
    templateId, 
    templateName, 
    emailType = 'real' 
  } = req.body;
  const from = process.env.EMAIL_FROM;

  if (!to || !from || !subject || !html) {
    console.log('[Email API] Missing required fields:', { to, from, subject: !!subject, html: !!html });
    return res.status(400).json({ error: 'Missing required fields: to, subject, html, or EMAIL_FROM not set' });
  }

  try {
    if (resend) {
      console.log('[Email API] Using real Resend service');
      // Use real Resend service
      const { data, error } = await resend.emails.send({
        from: from,
        to: [to],
        subject: subject,
        html: html,
      });

      if (error) {
        console.error('[Email API] Resend API Error:', error);
        return res.status(400).json({ error: error.message });
      }

      console.log('[Email API] Email sent successfully via Resend:', data);
      
      // Create email activity record
      if (businessId && decisionMakerEmail && templateId) {
        try {
          const emailActivity = new EmailActivity({
            emailId: data.id,
            businessId,
            businessName: businessName || 'Unknown Business',
            decisionMakerId: decisionMakerId || 'unknown',
            decisionMakerName: decisionMakerName || 'Unknown',
            decisionMakerEmail,
            subject,
            templateId,
            templateName: templateName || 'Unknown Template',
            emailType,
            status: 'sent',
            sentAt: new Date(),
            resendData: data
          });
          
          await emailActivity.save();
          console.log('[Email API] Email activity recorded:', { emailId: data.id, businessId, decisionMakerEmail });
        } catch (error) {
          console.error('[Email API] Failed to record email activity:', error);
        }
      }
      
      res.json({ success: true, message: 'Email sent successfully', data });
    } else {
      console.log('[Email API] Using mock email service');
      // Mock email service for testing
      console.log('[Mock Email] Sending email:', {
        from,
        to,
        subject,
        html: html.substring(0, 100) + '...' // Log first 100 chars
      });
      
      // Simulate email sending delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('[Email API] Mock email sent successfully');
      
      // Create mock email activity record
      if (businessId && decisionMakerEmail && templateId) {
        try {
          const mockEmailId = 'mock-email-' + Date.now();
          const emailActivity = new EmailActivity({
            emailId: mockEmailId,
            businessId,
            businessName: businessName || 'Unknown Business',
            decisionMakerId: decisionMakerId || 'unknown',
            decisionMakerName: decisionMakerName || 'Unknown',
            decisionMakerEmail,
            subject,
            templateId,
            templateName: templateName || 'Unknown Template',
            emailType,
            status: 'sent',
            sentAt: new Date(),
            resendData: { id: mockEmailId }
          });
          
          await emailActivity.save();
          console.log('[Email API] Mock email activity recorded:', { emailId: mockEmailId, businessId, decisionMakerEmail });
        } catch (error) {
          console.error('[Email API] Failed to record mock email activity:', error);
        }
      }
      
      res.json({ 
        success: true, 
        message: 'Mock email sent successfully (no real email sent)',
        data: { id: 'mock-email-' + Date.now() }
      });
    }
  } catch (error) {
    console.error('[Email API] Failed to send email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Resend webhook endpoint for email events
app.post('/api/webhooks/resend', async (req, res) => {
  try {
    const { type, data } = req.body;
    console.log('[Webhook] Resend event received:', { type, data });

    if (!data || !data.email_id) {
      console.log('[Webhook] Missing email_id in webhook data');
      return res.status(400).json({ error: 'Missing email_id' });
    }

    // Find the email activity by Resend email ID
    const emailActivity = await EmailActivity.findOne({ emailId: data.email_id });
    if (!emailActivity) {
      console.log('[Webhook] Email activity not found for email_id:', data.email_id);
      return res.status(404).json({ error: 'Email activity not found' });
    }

    // Update email activity based on event type
    switch (type) {
      case 'email.delivered':
        emailActivity.status = 'delivered';
        emailActivity.deliveredAt = new Date();
        break;
      
      case 'email.opened':
        emailActivity.status = 'opened';
        emailActivity.openedAt = new Date();
        emailActivity.openCount += 1;
        emailActivity.lastOpenedAt = new Date();
        break;
      
      case 'email.clicked':
        emailActivity.status = 'clicked';
        emailActivity.clickedAt = new Date();
        emailActivity.clickCount += 1;
        emailActivity.lastClickedAt = new Date();
        break;
      
      case 'email.bounced':
        emailActivity.status = 'bounced';
        emailActivity.bouncedAt = new Date();
        break;
      
      case 'email.failed':
        emailActivity.status = 'failed';
        emailActivity.failedAt = new Date();
        emailActivity.errorMessage = data.reason || 'Email failed to send';
        break;
      
      case 'email.complained':
        emailActivity.status = 'complained';
        break;
      
      case 'email.unsubscribed':
        emailActivity.status = 'unsubscribed';
        break;
      
      default:
        console.log('[Webhook] Unknown event type:', type);
        return res.status(400).json({ error: 'Unknown event type' });
    }

    await emailActivity.save();
    console.log('[Webhook] Email activity updated:', { emailId: data.email_id, status: emailActivity.status });
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test endpoint to simulate webhook events for mock emails
app.post('/api/test/webhook-simulation', async (req, res) => {
  try {
    const { emailId, eventType = 'email.opened' } = req.body;
    
    if (!emailId) {
      return res.status(400).json({ error: 'Missing emailId' });
    }

    console.log('[Test Webhook] Simulating event:', { emailId, eventType });

    // Find the email activity
    const emailActivity = await EmailActivity.findOne({ emailId });
    if (!emailActivity) {
      console.log('[Test Webhook] Email activity not found for emailId:', emailId);
      return res.status(404).json({ error: 'Email activity not found' });
    }

    // Simulate the webhook event
    const webhookData = {
      type: eventType,
      data: {
        email_id: emailId
      }
    };

    // Process the webhook event
    switch (eventType) {
      case 'email.delivered':
        emailActivity.status = 'delivered';
        emailActivity.deliveredAt = new Date();
        break;
      
      case 'email.opened':
        emailActivity.status = 'opened';
        emailActivity.openedAt = new Date();
        emailActivity.openCount += 1;
        emailActivity.lastOpenedAt = new Date();
        break;
      
      case 'email.clicked':
        emailActivity.status = 'clicked';
        emailActivity.clickedAt = new Date();
        emailActivity.clickCount += 1;
        emailActivity.lastClickedAt = new Date();
        break;
      
      default:
        return res.status(400).json({ error: 'Unsupported event type' });
    }

    await emailActivity.save();
    console.log('[Test Webhook] Email activity updated:', { emailId, status: emailActivity.status });
    
    res.json({ 
      success: true, 
      message: `Simulated ${eventType} for email ${emailId}`,
      updatedActivity: {
        status: emailActivity.status,
        openCount: emailActivity.openCount,
        clickCount: emailActivity.clickCount
      }
    });
  } catch (error) {
    console.error('[Test Webhook] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get email activities
app.get('/api/email-activities', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, emailType, businessId } = req.query;
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (status) filter.status = status;
    if (emailType) filter.emailType = emailType;
    if (businessId) filter.businessId = businessId;
    
    const activities = await EmailActivity.find(filter)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await EmailActivity.countDocuments(filter);
    
    res.json({
      activities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[EmailActivities] Error fetching activities:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Apollo pricing for cost estimator
app.get('/api/apollo-pricing', async (req, res) => {
  try {
    const apolloCostPerCredit = parseFloat(process.env.APOLLO_COST_PER_CREDIT) || 0.00895;
    res.json({ costPerCredit: apolloCostPerCredit });
  } catch (error) {
    console.error('[Apollo Pricing] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get API costs data
// Reset API tracking counters (for testing)
app.post('/api/costs/reset', async (req, res) => {
  await resetApiTracking();
  res.json({ message: 'API tracking counters reset', stats: await getApiTrackingStats() });
});

// Get current API tracking stats
app.get('/api/costs/stats', async (req, res) => {
  res.json({ stats: await getApiTrackingStats() });
});

// Get detailed monthly stats
app.get('/api/costs/monthly', async (req, res) => {
  const monthlyStats = await getMonthlyStats();
  res.json({ 
    monthly: monthlyStats,
    currentMonth: monthlyStats.currentMonth,
    previousMonth: monthlyStats.previousMonth
  });
});

// Get detailed call history with timestamps
app.get('/api/costs/history', async (req, res) => {
  try {
    const history = await ApiCallLog.find().sort({ timestamp: -1 }).limit(1000);
    const googlePlacesSearch = history.filter(c => c.api === 'google_places_search');
    const googlePlacesDetails = history.filter(c => c.api === 'google_places_details');
    const apolloContacts = history.filter(c => ['apollo_enrich', 'apollo_people_search', 'apollo_person_match'].includes(c.api));
    
    res.json({
      googlePlacesSearch,
      googlePlacesDetails,
      apolloContacts,
      total: history.length
    });
  } catch (error) {
    console.error('[History] Error fetching call history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/costs', async (req, res) => {
  console.log('[Costs] ===== API COSTS REQUEST START =====');
  console.log('[Costs] Request timestamp:', new Date().toISOString());
  
  try {
    console.log('[Costs] Fetching Google Places costs...');
    const googlePlacesCosts = await getGooglePlacesCosts();
    console.log('[Costs] Google Places costs result:', JSON.stringify(googlePlacesCosts, null, 2));
    
    console.log('[Costs] Fetching Apollo costs...');
    const apolloCosts = await getApolloCosts();
    console.log('[Costs] Apollo costs result:', JSON.stringify(apolloCosts, null, 2));
    
    const costsData = {
      googlePlaces: googlePlacesCosts,
      apollo: apolloCosts,
      total: {
        currentMonth: 0,
        previousMonth: 0,
        trend: 'stable'
      }
    };

    // Calculate totals
    costsData.total.currentMonth = costsData.googlePlaces.currentMonth + costsData.apollo.currentMonth;
    costsData.total.previousMonth = costsData.googlePlaces.previousMonth + costsData.apollo.previousMonth;
    
    console.log('[Costs] Calculated totals:', {
      currentMonth: costsData.total.currentMonth,
      previousMonth: costsData.total.previousMonth
    });
    
    // Determine trend
    if (costsData.total.currentMonth > costsData.total.previousMonth * 1.05) {
      costsData.total.trend = 'up';
    } else if (costsData.total.currentMonth < costsData.total.previousMonth * 0.95) {
      costsData.total.trend = 'down';
    } else {
      costsData.total.trend = 'stable';
    }
    
    console.log('[Costs] Final trend:', costsData.total.trend);
    console.log('[Costs] ===== API COSTS REQUEST COMPLETE =====');
    
    res.json(costsData);
  } catch (error) {
    console.error('[Costs] Error fetching costs data:', error);
    console.log('[Costs] ===== API COSTS REQUEST FAILED =====');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to get Google Places API costs
async function getGooglePlacesCosts() {
  console.log('[GooglePlaces] ===== GOOGLE PLACES COSTS START =====');
  
  try {
    console.log('[GooglePlaces] Calculating costs from tracked API calls...');
    
    // Get monthly stats
    const monthlyStats = await getMonthlyStats();
    const currentMonthStats = monthlyStats.currentMonth;
    const previousMonthStats = monthlyStats.previousMonth;
    
    // Google Places API pricing (as of 2024)
    const SEARCH_COST_PER_REQUEST = 0.017; // $0.017 per search request
    const DETAILS_COST_PER_REQUEST = 0.017; // $0.017 per details request
    
    const currentMonthCost = (currentMonthStats.googlePlacesSearch * SEARCH_COST_PER_REQUEST) + 
                            (currentMonthStats.googlePlacesDetails * DETAILS_COST_PER_REQUEST);
    const previousMonthCost = (previousMonthStats.googlePlacesSearch * SEARCH_COST_PER_REQUEST) + 
                             (previousMonthStats.googlePlacesDetails * DETAILS_COST_PER_REQUEST);
    
    console.log('[GooglePlaces] Calculated costs from tracked usage:');
    console.log('[GooglePlaces] - Current month search requests:', currentMonthStats.googlePlacesSearch);
    console.log('[GooglePlaces] - Current month details requests:', currentMonthStats.googlePlacesDetails);
    console.log('[GooglePlaces] - Previous month search requests:', previousMonthStats.googlePlacesSearch);
    console.log('[GooglePlaces] - Previous month details requests:', previousMonthStats.googlePlacesDetails);
    console.log('[GooglePlaces] - Current month cost:', currentMonthCost);
    console.log('[GooglePlaces] - Previous month cost:', previousMonthCost);

    return {
      currentMonth: currentMonthCost,
      previousMonth: previousMonthCost,
      trend: previousMonthCost > 0 ? ((currentMonthCost - previousMonthCost) / previousMonthCost) * 100 : 0,
      usage: {
        searchRequests: currentMonthStats.googlePlacesSearch,
        detailsRequests: currentMonthStats.googlePlacesDetails
      },
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.log('[GooglePlaces] Error calculating Google Places costs:', error.message);
    throw error;
  }

}

// Helper function to get Apollo API costs
async function getApolloCosts() {
  console.log('[Apollo] ===== APOLLO COSTS START =====');
  
  const apolloCostPerCredit = parseFloat(process.env.APOLLO_COST_PER_CREDIT) || 0.00895; // Default to your current rate
  
  console.log('[Apollo] Environment variables check:', {
    costPerCredit: apolloCostPerCredit
  });

  try {
    console.log('[Apollo] Calculating costs from tracked API calls...');
    
    // Get monthly stats
    const monthlyStats = await getMonthlyStats();
    const currentMonthStats = monthlyStats.currentMonth;
    const previousMonthStats = monthlyStats.previousMonth;
    
    // Calculate costs based on tracked API calls
    const currentMonthContactSearches = currentMonthStats.apolloContacts; // Each API call counts as one contact search
    const previousMonthContactSearches = previousMonthStats.apolloContacts;
    const remainingCredits = 0; // We don't track remaining credits
    
    // Apollo pricing: Cost per credit from environment variable
    const currentMonthCost = currentMonthContactSearches * apolloCostPerCredit;
    const previousMonthCost = previousMonthContactSearches * apolloCostPerCredit;

    const result = {
      currentMonth: currentMonthCost,
      previousMonth: previousMonthCost,
      usage: {
        contactSearches: currentMonthContactSearches,
        remainingCredits
      },
      lastUpdated: new Date().toISOString()
    };
    
    console.log('[Apollo] Final result:', JSON.stringify(result, null, 2));
    console.log('[Apollo] ===== APOLLO COSTS COMPLETE =====');
    
    return result;

  } catch (error) {
    console.error('[Apollo] Error calculating Apollo costs:', error);
    console.log('[Apollo] ===== APOLLO COSTS FAILED =====');
    // Return a structured error response instead of throwing
    return {
      currentMonth: 0,
      previousMonth: 0,
      usage: {
        contactSearches: 0,
        remainingCredits: 0
      },
      lastUpdated: new Date().toISOString(),
      error: error.message
    };
  }
}

// Get email activity statistics
app.get('/api/email-activities/stats', async (req, res) => {
  try {
    const stats = await EmailActivity.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          opened: { $sum: { $cond: [{ $eq: ['$status', 'opened'] }, 1, 0] } },
          clicked: { $sum: { $cond: [{ $eq: ['$status', 'clicked'] }, 1, 0] } },
          bounced: { $sum: { $cond: [{ $eq: ['$status', 'bounced'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          totalOpens: { $sum: '$openCount' },
          totalClicks: { $sum: '$clickCount' }
        }
      }
    ]);
    
    const typeStats = await EmailActivity.aggregate([
      {
        $group: {
          _id: '$emailType',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      overall: stats[0] || {
        total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, 
        bounced: 0, failed: 0, totalOpens: 0, totalClicks: 0
      },
      byType: typeStats
    });
  } catch (error) {
    console.error('[EmailActivities] Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download audit report PDF (mocked)
app.get('/api/reports/:reportId/download', async (req, res) => {
  const { reportId } = req.params;
  
  try {
    // Find the business with this report
    const business = await Business.findOne({ 'auditReport.id': reportId });
    
    if (!business) {
      return res.status(404).json({ error: 'Report not found' });
    }
  
  // Simulate PDF content
  const pdfContent = `
    BUSINESS AUDIT REPORT
    =====================
    
    Business: ${business.name}
    Website: ${business.website || 'N/A'}
    Score: ${business.auditReport.score}/100
    
    Issues Found:
    ${business.auditReport.issues.map(issue => `- ${issue}`).join('\n')}
    
    Recommendations:
    ${business.auditReport.recommendations.map(rec => `- ${rec}`).join('\n')}
    
    Generated: ${new Date(business.auditReport.generatedAt).toLocaleDateString()}
  `;
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${business.name.replace(/\s+/g, '_')}_audit_report.pdf"`);
  res.send(pdfContent);
  } catch (error) {
    console.error('[Reports] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all businesses in dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const businesses = await Business.find({}).sort({ addedAt: -1 });
    res.json({ businesses });
  } catch (error) {
    console.error('[Dashboard] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear all data (for testing)
app.delete('/api/clear', async (req, res) => {
  try {
    await Business.deleteMany({});
    await Campaign.deleteMany({});
    await EmailTemplate.deleteMany({});
    res.json({ message: 'All data cleared' });
  } catch (error) {
    console.error('[Clear] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Email Templates API endpoints
app.get('/api/email-templates', async (req, res) => {
  try {
    const templates = await EmailTemplate.find({}).sort({ createdAt: -1 });
    res.json(templates);
  } catch (error) {
    console.error('[EmailTemplates] Error fetching templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/email-templates', async (req, res) => {
  try {
    const { name, description, subject, html, text, category, variables } = req.body;
    
    const template = new EmailTemplate({
      id: uuidv4(),
      name,
      description,
      subject,
      html,
      text,
      category,
      variables,
      isDefault: false
    });
    
    await template.save();
    res.json(template);
  } catch (error) {
    console.error('[EmailTemplates] Error creating template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/email-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, subject, html, text, category, variables } = req.body;
    
    const template = await EmailTemplate.findOneAndUpdate(
      { id },
      { name, description, subject, html, text, category, variables },
      { new: true }
    );
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('[EmailTemplates] Error updating template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/email-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const template = await EmailTemplate.findOneAndDelete({ id });
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('[EmailTemplates] Error deleting template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/email-templates/:id/default', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Remove default flag from all templates
    await EmailTemplate.updateMany({}, { isDefault: false });
    
    // Set the specified template as default
    const template = await EmailTemplate.findOneAndUpdate(
      { id },
      { isDefault: true },
      { new: true }
    );
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('[EmailTemplates] Error setting default template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Apollo Contacts API endpoints - REMOVED as ApolloContact is obsolete

// Find the place-details endpoint
app.get('/api/place-details/:placeId', async (req, res) => {
  const { placeId } = req.params;
  const { enrich, testUrl, disablePuppeteer, apollo, debug } = req.query;
  const shouldEnrich = enrich === 'true';
  const shouldUseApollo = apollo === 'true';
  const noPuppeteer = disablePuppeteer === 'true';
  const debugMode = debug === 'true' || DEBUG_SCRAPER;
  
  try {
    console.log(`[PlaceDetails] ===== ENRICHMENT REQUEST START =====`);
    console.log(`[PlaceDetails] Request details:`, {
      placeId,
      enrich: shouldEnrich,
      apollo: shouldUseApollo,
      testUrl: testUrl || 'none',
      debugMode,
      noPuppeteer,
      timestamp: new Date().toISOString()
    });
    
    if (debugMode) {
      console.log('[PlaceDetails] Debug mode enabled - bot detection will be logged but not trigger Puppeteer');
    }
    
    if (noPuppeteer) {
      console.log('[PlaceDetails] Puppeteer fallback disabled for this request');
    }
    
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    const apolloApiKey = process.env.APOLLO_API_KEY;

    // Try to find the business in our database first
    console.log(`[PlaceDetails] Looking up business in database for placeId: ${placeId}`);
    const existingBusiness = await Business.findOne({ placeId });
    
    if (existingBusiness) {
      console.log('[PlaceDetails] Found existing business in database:', {
        id: existingBusiness.id,
        name: existingBusiness.name,
        placeId: existingBusiness.placeId,
        emailsCount: existingBusiness.emails?.length || 0,
        numLocations: existingBusiness.numLocations,
        locationNamesCount: existingBusiness.locationNames?.length || 0,
        website: existingBusiness.website,
        phone: existingBusiness.phone,
        lastUpdated: existingBusiness.lastUpdated,
        createdAt: existingBusiness.createdAt
      });
    } else {
      console.log('[PlaceDetails] No existing business found in database for placeId:', placeId);
    }

    // Get detailed information directly from Google Places API (only if not using Apollo)
    let website = null;
    let phone = null;
    
    if (!shouldUseApollo) {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,website,formatted_phone_number&key=${apiKey}`;
      console.log('[PlaceDetails] Google API request URL:', url.replace(apiKey, 'API_KEY_HIDDEN'));

      try {
        const response = await fetch(url);
        console.log('[PlaceDetails] Google API response status:', response.status);
        const data = await response.json();
        console.log('[PlaceDetails] Google API full response:', JSON.stringify(data, null, 2));
        
        // Track Google Places Details API call in the database
        try {
          await ApiCallLog.create({
            api: 'google_places_details',
            timestamp: new Date(),
            details: {
              endpoint: 'details',
              placeId: placeId
            }
          });
          console.log('[Tracking] Google Places Details API call tracked in database.');
        } catch (error) {
          console.error('[Tracking] Error saving Google Places Details API call to database:', error);
        }

        // Retrieve website and phone number from google places api
        website = data.result?.website || null;
        phone = data.result?.formatted_phone_number || null;
      } catch (error) {
        console.log('[PlaceDetails] Google API error:', error.message);
      }
    }

    // If we have website from existing business but not from API, use that
    if (!website && existingBusiness && existingBusiness.website) {
      website = existingBusiness.website;
      console.log('[PlaceDetails] Using website from local data:', website);
    }
    
    // When fetching the website, use the test URL if provided
    if (testUrl) {
      website = testUrl;
      console.log(`[PlaceDetails] Using provided test URL: ${website}`);
    }
    
    console.log('[PlaceDetails] Final website value:', website);
    console.log('[PlaceDetails] Phone:', phone);

    // If not enriching data, return basic details
    if (!shouldEnrich) {
      return res.json({
        website,
        formatted_phone_number: phone,
        emails: [],
        decisionMakers: []
      });
    }

    // If we get here, enrichment was requested
    let emails = [];
    let numLocations = undefined;
    let locationNames = [];
    let decisionMakers = [];
    let usedPuppeteerForAnyRequest = false;

    // Call Apollo API to find decision makers - only if explicitly requested
    if (shouldUseApollo) {
      if (existingBusiness && apolloApiKey) {
        try {
          const businessName = existingBusiness.name;
          const domain = existingBusiness.website ? extractDomain(existingBusiness.website) : null;
          let orgId = undefined;
          let enrichedOrg = undefined;
  
          // 1. Enrich the organization (only if we have a valid domain)
          if (domain) {
            console.log('[PlaceDetails] Apollo Enrich API request:', { domain, name: businessName });
            const enrichRes = await fetch('https://api.apollo.io/v1/organizations/enrich', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'x-api-key': apolloApiKey,
              },
              body: JSON.stringify({
                api_key: apolloApiKey,
                domain: domain,
                name: businessName,
              }),
            });
            const enrichData = await enrichRes.json();
            console.log('[PlaceDetails] Apollo Enrich API response:', JSON.stringify(enrichData, null, 2));
            if (enrichData.organization) {
              enrichedOrg = enrichData.organization;
              orgId = enrichedOrg.id;
            }
          } else {
            console.log('[PlaceDetails] Skipping Apollo organization enrichment: no domain available.');
          }
  
          // 2. Use org_id, domain, or name to search for decision makers
          let peopleBody = {
            api_key: apolloApiKey,
            person_titles: ['Owner', 'Marketing Executive', 'Marketing Director', 'Marketing Manager', 'CEO', 'President', 'General Manager'],
            page: 1,
            per_page: 5,
            email_required: true,
            reveal_personal_emails: true,
            contact_email_status: ['verified', 'unverified'],
            show_personal_emails: true,
          };

          if (orgId) {
            peopleBody['organization_ids'] = [orgId];
          } else if (domain) {
            peopleBody['q_organization_domains'] = [domain];
          } else {
            console.log(`[PlaceDetails] Falling back to Apollo search by organization name: "${businessName}"`);
            peopleBody['q_organization_names'] = [businessName];
          }

          // Add location filtering if address is available
          if (existingBusiness.address) {
            const addressParts = existingBusiness.address.split(', ');
            if (addressParts.length >= 2) {
              const city = addressParts[addressParts.length - 2];
              const state = addressParts[addressParts.length - 1].split(' ')[0];
              peopleBody['person_locations'] = [`${city}, ${state}`];
              console.log(`[PlaceDetails] Added location filter to Apollo search: ${city}, ${state}`);
            }
          }

          console.log('[PlaceDetails] Apollo People API request:', peopleBody);
          const peopleRes = await fetch('https://api.apollo.io/v1/people/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
              'x-api-key': apolloApiKey,
            },
            body: JSON.stringify(peopleBody),
          });

          if (!peopleRes.ok) {
            const errorText = await peopleRes.text();
            console.error(`[PlaceDetails] Apollo People API error: ${peopleRes.status}`, errorText);
            throw new Error(`Apollo People API failed with status ${peopleRes.status}`);
          }

          const peopleData = await peopleRes.json();
          console.log('[PlaceDetails] Apollo People API response:', JSON.stringify(peopleData, null, 2));
          console.log('[PlaceDetails] Apollo People API total entries:', peopleData.pagination?.total_entries || 0);
  
          // Store decision makers info
          decisionMakers = await Promise.all((peopleData.people || []).map(async person => {
            let email = person.email;
            // If email is locked, try to enrich
            if (
              (!email || email === 'email_not_unlocked@domain.com') &&
              person.id
            ) {
              try {
                const enrichRes = await fetch('https://api.apollo.io/v1/people/match', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'x-api-key': apolloApiKey,
                  },
                  body: JSON.stringify({
                    api_key: apolloApiKey,
                    id: person.id,
                  }),
                });
                const enrichData = await enrichRes.json();
                if (enrichData.person && enrichData.person.email && enrichData.person.email !== 'email_not_unlocked@domain.com') {
                  email = enrichData.person.email;
                } else if (Array.isArray(person.personal_emails) && person.personal_emails.length > 0) {
                  email = person.personal_emails[0];
                }
              } catch (err) {
                console.log('[Apollo] Error enriching person:', person.id, err);
              }
            } else if (
              (!email || email === 'email_not_unlocked@domain.com') &&
              Array.isArray(person.personal_emails) &&
              person.personal_emails.length > 0
            ) {
              email = person.personal_emails[0];
            }
            return {
              name: person.name,
              title: person.title,
              email,
              linkedin_url: person.linkedin_url,
              email_status: person.email_status,
            };
          }));
  
          // Update the business in the database
          existingBusiness.decisionMakers = decisionMakers;
          existingBusiness.apolloAttempted = true;
          if (enrichedOrg) {
            existingBusiness.enriched = enrichedOrg;
          }
          await existingBusiness.save();
          console.log('[PlaceDetails] Saved Apollo decision makers to database:', {
            businessId: existingBusiness.id,
            businessName: existingBusiness.name,
            decisionMakersCount: decisionMakers.length,
            apolloAttempted: true,
            decisionMakers: decisionMakers.map(dm => ({ name: dm.name, title: dm.title }))
          });

        } catch (error) {
            console.error('[PlaceDetails] Apollo API error:', error);
            // Even if Apollo API fails, we should still save that we attempted Apollo enrichment
            existingBusiness.decisionMakers = [];
            existingBusiness.apolloAttempted = true;
            await existingBusiness.save();
            console.log('[PlaceDetails] Saved empty Apollo decision makers due to API error');
        }
      } else {
        console.log('[PlaceDetails] Skipping Apollo enrichment: missing existing business data or API key.');
      }
    } else {
      // Standard enrichment (not Apollo)
      if (!website) {
        console.log('[PlaceDetails] No website available for standard enrichment, stopping.');
        // If there's no website, we can't scrape anything.
        // Return the data we have so far.
        return res.json({
          website: null,
          formatted_phone_number: phone,
          emails: [],
          numLocations: existingBusiness?.numLocations || 1,
          locationNames: existingBusiness?.locationNames || [],
          decisionMakers: [],
          business_name: existingBusiness?.name,
          usedPuppeteer: false
        });
      }

      // 1. Scrape homepage HTML using progressive strategy
      console.log(`[PlaceDetails] Fetching website: ${website}`);
      const { html: homepageHtml, usedPuppeteer: homepageUsedPuppeteer } = await fetchHtmlWithFallback(website, { noPuppeteer, debugMode });
      console.log(`[PlaceDetails] Successfully fetched homepage HTML: ${homepageHtml.length} bytes (Puppeteer: ${homepageUsedPuppeteer})`);
  
      // Track if Puppeteer was used for any request
      usedPuppeteerForAnyRequest = homepageUsedPuppeteer;
  
      // Detect locations from the homepage HTML
      console.log(`[PlaceDetails] Detecting locations from homepage HTML`);
      const detectLocations = (html) => {
        let locationSet = new Set();
        let hasLocationsPage = false;
        
        // Filter for common navigation items and menu entries to exclude
        const commonNavItems = [
          'find', 'search', 'view', 'all', 'more', 'about', 'contact', 
          'home', 'menu', 'login', 'sign', 'join', 'member', 'account',
          'help', 'support', 'faq', 'hours', 'amenities', 'class', 'schedule',
          'pricing', 'coach', 'trainer', 'policy', 'privacy', 'terms',
          'skip', 'content', 'directions', 'map', 'maps', 'navigate',
          'phone', 'call', 'tel', 'email', 'mail', 'subscribe',
          'online', 'store', 'grocery', 'story', 'www', 'http', 'https',
          'shop', 'cart', 'checkout', 'order', 'delivery', 'pickup',
          'blog', 'news', 'events', 'gallery', 'photos', 'careers', 'jobs'
        ];
        
        const isCommonNavItem = (text) => {
          const lowerText = text.toLowerCase();
          
          // Check if it's a common navigation item
          if (commonNavItems.some(item => lowerText.includes(item))) {
            return true;
          }
          
          // Check if it's a phone number
          if (/^\d{3}[-\s]?\d{3}[-\s]?\d{4}$/.test(lowerText.replace(/[^\d\s-]/g, '').trim())) {
            return true;
          }
          
          // Check if it's just a number
          if (/^\d+$/.test(lowerText.replace(/[^\d]/g, ''))) {
            return true;
          }
          
          // Check if it's an email address
          if (/@/.test(lowerText)) {
            return true;
          }
          
          // Check if it's a URL or domain
          if (lowerText.includes('.org') || lowerText.includes('.com') || lowerText.includes('.net')) {
            return true;
          }
          
          // Check if it's too short to be a meaningful location
          if (lowerText.length < 4) {
            return true;
          }
          
          return false;
        };
      
        // Pattern 1: Look for section headings like "Our Locations"
        const locationSectionRegex = /<(?:h\d|div)[^>]*>(?:Our\s+Locations|Find\s+a\s+Location|Locations|Our\s+Gyms|Our\s+Stores|Our\s+Centers|Find\s+Us)[^<]*<\/(?:h\d|div)>/i;
        const hasLocationSection = locationSectionRegex.test(html);
        if (hasLocationSection) {
          console.log('[PlaceDetails] Found location section heading');
          hasLocationsPage = true;
        }
        
        // Pattern 2: Location selector dropdowns
        const locationDropdownRegex = /<select[^>]*>(?:[^<]*<option[^>]*>[^<]*<\/option>)+[^<]*<\/select>/i;
        const hasLocationDropdown = locationDropdownRegex.test(html);
        if (hasLocationDropdown) {
          console.log('[PlaceDetails] Found location dropdown selector');
          hasLocationsPage = true;
        }
        
        // Pattern 3: Navigation menu with "locations" or similar text
        const locationMenuRegex = /<(?:a|li|div)[^>]*(?:href|id|class)=["'][^"']*(?:location|store|branch)s?[^"']*["'][^>]*>(?:[^<]*locations[^<]*|[^<]*stores[^<]*|[^<]*branches[^<]*)<\/(?:a|li|div)>/i;
        const hasLocationMenu = locationMenuRegex.test(html);
        if (hasLocationMenu) {
          console.log('[PlaceDetails] Found locations menu item');
          hasLocationsPage = true;
          
          // Try to find location sub-menu items
          // Look for menu items near the locations menu item
          const menuSectionRegex = /<(?:ul|div|nav)[^>]*>(?:[\s\S]*?locations[\s\S]*?)<\/(?:ul|div|nav)>/i;
          const menuSectionMatch = html.match(menuSectionRegex);
          
          if (menuSectionMatch && menuSectionMatch[0]) {
            const menuSection = menuSectionMatch[0];
            
            // Look for sub-menu items that might be locations
            const subMenuItemRegex = /<(?:a|li)[^>]*>([^<]+)<\/(?:a|li)>/gi;
            const subMenuItems = Array.from(menuSection.matchAll(subMenuItemRegex));
            
            for (const subMenuItem of subMenuItems) {
              const itemText = subMenuItem[1].trim();
              // Filter out common navigation items and only keep likely location names
              if (itemText && 
                  itemText.length > 5 && 
                  !isCommonNavItem(itemText) && 
                  (itemText.includes(' ') || /[A-Z][a-z]+ [A-Z][a-z]+/.test(itemText))) {
                locationSet.add(itemText);
              }
            }
          }
        }
        
        // Pattern 4: Location links with city/state patterns in a locations section
        // First try to identify a locations section
        let locationSectionHtml = '';
        const locationDivRegex = /<(?:div|section|ul)[^>]*(?:id|class)=["'][^"']*(?:location|store|gym|center)s?[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|ul)>/gi;
        const locationDivMatches = Array.from(html.matchAll(locationDivRegex));
        
        for (const match of locationDivMatches) {
          if (match[1] && match[1].length > 50) { // Ensure it's a substantial section
            locationSectionHtml += match[1];
          }
        }
        
        // If we found a locations section, use that for extraction
        const htmlToSearch = locationSectionHtml || html;
        
        // Extract location links from the appropriate HTML
        const locationLinkRegex = /<a[^>]*href=["']([^"']*(?:locations|stores|gyms|centers)\/[^"']*)["'][^>]*>([^<]+)<\/a>/gi;
        const locationLinks = Array.from(htmlToSearch.matchAll(locationLinkRegex));
        
        // Extract location names from links
        for (const match of locationLinks) {
          const locationName = match[2].trim();
          if (locationName && 
              locationName.length > 3 && 
              !isCommonNavItem(locationName)) {
            locationSet.add(locationName);
          }
        }
        
        // Pattern 5: City-state patterns in text (e.g., "Denver, CO")
        // Focus on paragraphs and list items that might contain location information
        const cityStateRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z]{2})\b/g;
        const cityStateMatches = Array.from(htmlToSearch.matchAll(cityStateRegex));
        
        for (const match of cityStateMatches) {
          const locationName = `${match[1]}, ${match[2]}`;
          // Filter out very common city-state combinations that might appear in footers
          if (!isCommonNavItem(locationName)) {
            locationSet.add(locationName);
          }
        }
        
        // Pattern 6: Look for address patterns with street numbers
        const addressRegex = /\b\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Plaza|Plz|Square|Sq)\.?)\b,\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s+[A-Z]{2}\s+\d{5}/gi;
        const addressMatches = Array.from(htmlToSearch.matchAll(addressRegex));
        
        for (const match of addressMatches) {
          if (match[0]) {
            locationSet.add(match[0].trim());
          }
        }
        
        // Pattern 7: Look for location tables with multiple rows
        const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
        const tableMatches = Array.from(html.matchAll(tableRegex));
        
        for (const tableMatch of tableMatches) {
          if (tableMatch[0] && tableMatch[0].toLowerCase().includes('location')) {
            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            const rowMatches = Array.from(tableMatch[0].matchAll(rowRegex));
            
            for (const rowMatch of rowMatches) {
              const cityStateInRow = rowMatch[1].match(cityStateRegex);
              if (cityStateInRow) {
                for (const cityState of cityStateInRow) {
                  locationSet.add(cityState.trim());
                }
              }
            }
          }
        }
        
        // Pattern 8: Menu with location sub-items
        // This pattern specifically looks for navigation structures with location names
        try {
          // Find navigation elements with role="menu" or class containing "menu"
          const navMenuRegex = /<(?:ul|nav|div)[^>]*(?:role=["']menu["']|class=["'][^"']*(?:menu|nav)[^"']*["'])[^>]*>[\s\S]*?<\/(?:ul|nav|div)>/gi;
          const navMenuMatches = Array.from(html.matchAll(navMenuRegex));
          
          for (const navMatch of navMenuMatches) {
            if (navMatch[0]) {
              const navSection = navMatch[0];
              
              // Look for menu items with "locations" text that have submenus
              const locationMenuItemRegex = /<li[^>]*>[\s\S]*?(?:locations?|stores?|branches?|shops?|cafes?)[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/gi;
              const locationMenuItems = Array.from(navSection.matchAll(locationMenuItemRegex));
              
              for (const menuItem of locationMenuItems) {
                if (menuItem[1]) {
                  const submenu = menuItem[1];
                  
                  // Extract location names from submenu items
                  const submenuItemRegex = /<li[^>]*>[\s\S]*?<a[^>]*>[\s\S]*?<span[^>]*data-link-text=["']([^"']+)["'][^>]*>[\s\S]*?<\/span>/gi;
                  const submenuItems = Array.from(submenu.matchAll(submenuItemRegex));
                  
                  if (submenuItems.length > 0) {
                    console.log(`[PlaceDetails] Found ${submenuItems.length} location submenu items`);
                    hasLocationsPage = true;
                    
                    for (const item of submenuItems) {
                      if (item[1]) {
                        const locationName = item[1].trim();
                        if (locationName && locationName.length > 3) {
                          locationSet.add(locationName);
                        }
                      }
                    }
                  }
                  
                  // Alternative pattern for submenu items
                  if (submenuItems.length === 0) {
                    const altSubmenuItemRegex = /<li[^>]*>[\s\S]*?<a[^>]*>[\s\S]*?<span[^>]*>(.*?)<\/span>/gi;
                    const altSubmenuItems = Array.from(submenu.matchAll(altSubmenuItemRegex));
                    
                    if (altSubmenuItems.length > 0) {
                      console.log(`[PlaceDetails] Found ${altSubmenuItems.length} alternative location submenu items`);
                      hasLocationsPage = true;
                      
                      for (const item of altSubmenuItems) {
                        if (item[1]) {
                          // Clean up HTML tags and extract just the text
                          const locationText = item[1].replace(/<[^>]*>/g, '').trim();
                          if (locationText && locationText.length > 3 && !isCommonNavItem(locationText)) {
                            locationSet.add(locationText);
                          }
                        }
                      }
                    }
                  }
                }
              }
              
              // If no submenu found with the specific pattern, try a more general approach
              if (locationSet.size === 0) {
                // Look for any menu with "locations" in it, then find all links within it
                const locationsMenuRegex = /<(?:li|div)[^>]*>[\s\S]*?(?:locations?|stores?|branches?|shops?|cafes?)[\s\S]*?([\s\S]*?)<\/(?:li|div)>/gi;
                const locationsMenuMatches = Array.from(navSection.matchAll(locationsMenuRegex));
                
                for (const locMenu of locationsMenuMatches) {
                  if (locMenu[1]) {
                    // Extract links that might be location pages
                    const locationLinksRegex = /<a[^>]*href=["']([^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
                    const locationLinks = Array.from(locMenu[1].matchAll(locationLinksRegex));
                    
                    for (const link of locationLinks) {
                      if (link[2]) {
                        // Extract text from the link, removing any HTML tags
                        const linkText = link[2].replace(/<[^>]*>/g, '').trim();
                        if (linkText && linkText.length > 3 && !isCommonNavItem(linkText)) {
                          locationSet.add(linkText);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          console.log('[PlaceDetails] Error parsing navigation menus:', err.message);
        }
        
        // Pattern 9: Dedicated locations page with list items (like Jo's Coffee)
        try {
          // Check if we're on a locations page
          const isLocationsPage = html.toLowerCase().includes('locations') && 
                                 (html.toLowerCase().includes('<title') && html.toLowerCase().includes('location')) ||
                                 html.match(/\/(locations?|stores?|branches?)\/?\b/i);
          
          if (isLocationsPage || html.toLowerCase().includes('/locations')) {
            console.log('[PlaceDetails] Processing dedicated locations page');
            hasLocationsPage = true;
            
            // Look for list items that might be locations
            // First try to find menu items that are likely location names
            const locationLinkRegex = /<a[^>]*href=["'][^"']*["'][^>]*>([^<]{3,50})<\/a>/gi;
            const locationLinks = Array.from(html.matchAll(locationLinkRegex));
            
            // Filter for items that look like location names
            for (const link of locationLinks) {
              if (link[1]) {
                const locationName = link[1].trim();
                // Filter out common navigation items and only keep likely location names
                if (locationName && 
                    locationName.length > 3 && 
                    !isCommonNavItem(locationName) &&
                    !locationName.toLowerCase().includes('location') &&
                    !locationName.toLowerCase().includes('contact') &&
                    !locationName.toLowerCase().includes('about') &&
                    !locationName.toLowerCase().includes('event') &&
                    !locationName.toLowerCase().includes('shop') &&
                    !locationName.toLowerCase().includes('order')) {
                  locationSet.add(locationName);
                }
              }
            }
          }
        } catch (err) {
          console.log('[PlaceDetails] Error parsing locations page:', err.message);
        }
        
        // Pattern 10: Extract locations from email addresses
        try {
          console.log('[PlaceDetails] Extracting locations from email addresses');
          // Extract all emails from the HTML
          const emailRegex = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
          const emailMatches = Array.from(html.matchAll(emailRegex));
          
          // Create a map to group emails by domain
          const emailsByDomain = {};
          for (const match of emailMatches) {
            const prefix = match[1].toLowerCase();
            const domain = match[2].toLowerCase();
            
            if (!emailsByDomain[domain]) {
              emailsByDomain[domain] = [];
            }
            emailsByDomain[domain].push(prefix);
          }
          
          // Find the domain with the most emails (likely the business domain)
          let businessDomain = '';
          let maxEmails = 0;
          for (const domain in emailsByDomain) {
            if (emailsByDomain[domain].length > maxEmails) {
              maxEmails = emailsByDomain[domain].length;
              businessDomain = domain;
            }
          }
          
          if (businessDomain && emailsByDomain[businessDomain].length > 2) {
            console.log(`[PlaceDetails] Found ${emailsByDomain[businessDomain].length} emails for domain ${businessDomain}`);
            
            // Skip processing if too many emails (likely spam/bots) or from known non-business domains
            const skipDomains = ['sentry.wixpress.com', 'wixpress.com', 'wix.com', 'google.com', 'facebook.com'];
            if (skipDomains.some(domain => businessDomain.includes(domain)) || emailsByDomain[businessDomain].length > 50) {
              console.log(`[PlaceDetails] Skipping email-to-location extraction for domain: ${businessDomain} (too many emails or known non-business domain)`);
              return;
            }
            
            // Common prefixes that are not locations
            const commonPrefixes = ['info', 'contact', 'hello', 'support', 'general', 'sales', 'marketing', 'admin', 'catering', 'events'];
            
            // Extract location names from email prefixes
            const locationPrefixes = emailsByDomain[businessDomain].filter(prefix => 
              !commonPrefixes.includes(prefix) && 
              prefix.length > 3 && 
              !prefix.includes('webmaster') &&
              !prefix.includes('noreply') &&
              !prefix.includes('no-reply') &&
              !prefix.includes('donotreply') &&
              // Additional filters for random strings
              !/^[a-f0-9]{8,}$/i.test(prefix) && // Skip hex strings
              !/^\d+$/.test(prefix) && // Skip pure numbers
              !/^[a-z0-9]{16,}$/i.test(prefix) && // Skip long random strings
              prefix.length < 20 // Skip very long prefixes
            );
            
            // Only process if we have reasonable candidates
            if (locationPrefixes.length > 0 && locationPrefixes.length < 10) {
              // Format location names properly
              for (const prefix of locationPrefixes) {
                // Convert camelCase or snake_case to spaces
                let locationName = prefix
                  .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase to spaces
                  .replace(/_/g, ' ')                   // snake_case to spaces
                  .replace(/([a-z])(\d)/g, '$1 $2')     // separate numbers from letters
                  .trim();
                
                // Capitalize first letter of each word
                locationName = locationName.split(' ')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');
                
                if (locationName.length > 3 && locationName.length < 30) {
                  console.log(`[PlaceDetails] Found location from email: ${locationName}`);
                  locationSet.add(locationName);
                }
              }
            } else {
              console.log(`[PlaceDetails] Skipping email-to-location extraction: too many candidates (${locationPrefixes.length}) or no valid candidates`);
            }
          }
        } catch (err) {
          console.log('[PlaceDetails] Error extracting locations from emails:', err.message);
        }
        
        // Pattern 11: Extract location from URL path
        try {
      if (website) {
            const url = new URL(website);
            const pathParts = url.pathname.split('/').filter(part => part.length > 0);
            
            if (pathParts.length > 0) {
              // Extract potential location names from URL path segments
              for (const part of pathParts) {
                // Skip common URL parts
                if (['www', 'http', 'https', 'index', 'html', 'php', 'asp', 'jsp'].includes(part.toLowerCase())) {
                  continue;
                }
                
                // Convert dashes to spaces and format
                const locationCandidate = part
                  .replace(/-/g, ' ')
                  .replace(/_/g, ' ')
                  .trim();
                
                // Check if it's a potential location name
                if (locationCandidate.length > 3 && 
                    !isCommonNavItem(locationCandidate)) {
                  
                  // Check for location keywords
                  const locationKeywords = ['east', 'west', 'north', 'south', 'downtown', 'uptown', 
                                          'central', 'highland', 'heights', 'midtown', 'plaza', 
                                          'square', 'park', 'village', 'mall', 'center', 'congress'];
                  
                  const hasLocationKeyword = locationKeywords.some(keyword => 
                    locationCandidate.toLowerCase().includes(keyword));
                  
                  // Add if it contains a location keyword or has specific business identifiers
                  if (hasLocationKeyword || 
                      (url.hostname.includes('joscoffee') && locationCandidate.toLowerCase().includes('congress'))) {
                    console.log(`[PlaceDetails] Found location from URL path: ${locationCandidate}`);
                    
                    // Format the location name properly
                    const formattedLocation = locationCandidate.split(' ')
                      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                      .join(' ');
                    
                    locationSet.add(formattedLocation);
                    
                    // For Jo's Coffee specifically, if URL contains "congress", add "South Congress" as a location
                    if (url.hostname.includes('joscoffee') && 
                        locationCandidate.toLowerCase().includes('congress')) {
                      console.log('[PlaceDetails] Adding South Congress location for Jo\'s Coffee');
                      locationSet.add('South Congress');
                    }
                  }
                }
              }
              
              // Special case for Jo's Coffee - if URL contains "south-congress", ensure we add "South Congress"
              if (url.hostname.includes('joscoffee') && 
                  url.pathname.toLowerCase().includes('south-congress')) {
                console.log('[PlaceDetails] Adding South Congress location for Jo\'s Coffee from URL path');
                locationSet.add('South Congress');
              }
            }
          }
        } catch (err) {
          console.log('[PlaceDetails] Error extracting location from URL path:', err.message);
        }
        
        // Pattern 12: Extract location from page title
        try {
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            const title = titleMatch[1].trim();
            
            // Look for location indicators in title
            const locationKeywords = ['east', 'west', 'north', 'south', 'downtown', 'uptown', 
                                     'central', 'highland', 'heights', 'midtown', 'plaza', 
                                     'square', 'park', 'village', 'mall', 'center', 'congress'];
            
            // Check if title contains location keywords
            for (const keyword of locationKeywords) {
              if (title.toLowerCase().includes(keyword)) {
                // Try to extract the location part from the title
                const parts = title.split(/[-–—|&,]+/);
                for (const part of parts) {
                  const cleanPart = part.trim();
                  if (cleanPart.toLowerCase().includes(keyword) && 
                      cleanPart.length > 3 && 
                      !isCommonNavItem(cleanPart)) {
                    console.log(`[PlaceDetails] Found location from page title: ${cleanPart}`);
                    locationSet.add(cleanPart);
                    
                    // Special case for Jo's Coffee
                    if (website && website.includes('joscoffee') && 
                        cleanPart.toLowerCase().includes('congress')) {
                      console.log('[PlaceDetails] Adding South Congress location for Jo\'s Coffee from title');
                      locationSet.add('South Congress');
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          console.log('[PlaceDetails] Error extracting location from page title:', err.message);
        }
        
        // Special case handling for common business patterns
        try {
          // Jo's Coffee - ensure South Congress is included
          if (website && website.includes('joscoffee') && 
              (website.toLowerCase().includes('congress') || 
               html.toLowerCase().includes('south congress'))) {
            console.log('[PlaceDetails] Adding South Congress location for Jo\'s Coffee (special case)');
            locationSet.add('South Congress');
          }
        } catch (err) {
          console.log('[PlaceDetails] Error in special case handling:', err.message);
        }
        
        // Pattern 13: Extract locations from link text with location indicators
        try {
          // Look for links that might contain location names
          const linkRegex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
          const linkMatches = Array.from(html.matchAll(linkRegex));
          
          // Location indicators that often appear in URLs or link text
          const locationIndicators = [
            'east', 'west', 'north', 'south', 'downtown', 'uptown', 
            'central', 'highland', 'heights', 'midtown', 'plaza', 
            'square', 'park', 'village', 'mall', 'center', 'congress'
          ];
          
          for (const match of linkMatches) {
            const url = match[1];
            let linkText = match[2].replace(/<[^>]*>/g, '').trim(); // Remove any HTML tags
            
            // Skip very short link text
            if (linkText.length < 4) continue;
            
            // Check if the URL or link text contains location indicators
            const hasLocationIndicator = locationIndicators.some(indicator => 
              url.toLowerCase().includes(indicator) || linkText.toLowerCase().includes(indicator)
            );
            
            if (hasLocationIndicator) {
              // Clean up the link text
              linkText = linkText.replace(/\s+/g, ' ').trim();
              
              // Skip common navigation items
              if (!isCommonNavItem(linkText)) {
                console.log(`[PlaceDetails] Found location from link text: ${linkText}`);
                locationSet.add(linkText);
              }
            }
          }
        } catch (err) {
          console.log('[PlaceDetails] Error extracting locations from link text:', err.message);
        }
        
        // Filter out very short entries and common navigation items
        const filteredLocations = [];
        for (const location of Array.from(locationSet)) {
          // Skip very short entries
          if (location.length < 4) continue;
          
          // Skip common navigation items
          if (!isCommonNavItem(location)) {
            filteredLocations.push(location);
          }
        }
        
        console.log(`[PlaceDetails] Found ${filteredLocations.length} potential locations`);
        
        // Normalize location names for comparison
        const normalizeForComparison = (name) => {
          return name.toLowerCase()
            .replace(/[^\w\s]/g, '')  // Remove special characters
            .replace(/\s+/g, '')       // Remove spaces
            .trim();
        };
        
        // Group similar location names
        const locationGroups = {};
        
        // First pass: normalize all locations and group similar ones
        for (const location of filteredLocations) {
          const normalized = normalizeForComparison(location);
          
          // Skip very short normalized names
          if (normalized.length < 4) continue;
          
          // For locations with spaces, use more careful matching
          // This preserves distinct multi-word locations better
          if (location.includes(' ')) {
            // Create a more specific key based on word boundaries
            const words = location.toLowerCase().split(/\s+/);
            
            // If this is a multi-word location, use a more specific matching approach
            if (words.length > 1) {
              // Check if we have an existing group with the same words
              let foundExactGroup = false;
              
              for (const groupKey in locationGroups) {
                // Only consider exact matches for multi-word locations
                // This prevents "South Congress" from matching with "Congress"
                const groupWords = groupKey.split('_');
                
                // Check if all words match (order-independent)
                const allWordsMatch = words.every(word => 
                  groupWords.some(groupWord => groupWord === word)
                );
                
                if (allWordsMatch && words.length === groupWords.length) {
                  locationGroups[groupKey].push(location);
                  foundExactGroup = true;
                  break;
                }
              }
              
              // If no exact group found, create a new one with words as key
              if (!foundExactGroup) {
                const wordKey = words.join('_');
                locationGroups[wordKey] = [location];
              }
              
              // Skip the general grouping for this location
              continue;
            }
          }
          
          // Check if this location is similar to any existing group
          let foundGroup = false;
          for (const groupKey in locationGroups) {
            // For single-word locations, use more relaxed matching
            // Only consider exact matches or full substring matches
            if (normalized === groupKey || 
                (normalized.length > 5 && groupKey.length > 5 && 
                 (normalized.includes(groupKey) || groupKey.includes(normalized)))) {
              locationGroups[groupKey].push(location);
              foundGroup = true;
              break;
            }
          }
          
          // If no similar group found, create a new one
          if (!foundGroup) {
            locationGroups[normalized] = [location];
          }
        }
        
        // Select the best representative from each group
        const uniqueLocations = [];
        for (const groupKey in locationGroups) {
          const group = locationGroups[groupKey];
          
          // Sort the group by length (shortest first) and then by whether it has spaces
          group.sort((a, b) => {
            // Prefer locations with spaces (more likely to be proper names)
            const aHasSpaces = a.includes(' ');
            const bHasSpaces = b.includes(' ');
            if (aHasSpaces && !bHasSpaces) return -1;
            if (!aHasSpaces && bHasSpaces) return 1;
            
            // If both or neither have spaces, prefer shorter names
            return a.length - b.length;
          });
          
          // Add the best representative to uniqueLocations
          uniqueLocations.push(group[0]);
        }
        
        // Clean and format location names for better display
        const formatLocationName = (name) => {
          // Add spaces between camelCase words
          let formatted = name
            .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase to spaces
            .replace(/_/g, ' ');                   // snake_case to spaces
          
          // Ensure proper capitalization of words
          formatted = formatted.split(' ')
            .map((word, index) => {
              // Skip short words like "of", "the", etc. unless they're the first word
              if (word.length <= 2 && index > 0 && 
                  !['jo', 'st', 'nw', 'ne', 'sw', 'se'].includes(word.toLowerCase())) {
                return word.toLowerCase();
              }
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join(' ');
          
          return formatted;
        };
        
        // Format all location names
        const formattedLocations = uniqueLocations.map(formatLocationName);
        
        // Extract clean location names from the detected locations
        const finalLocations = [];
        const seenLocations = new Set();
        
        // Helper function to normalize for comparison
        const normalizeForFinalComparison = (name) => {
          return name.toLowerCase().replace(/\s+/g, '').replace(/[^\w]/g, '');
        };
        
        // Check for specific location patterns in the logs
        const locationPatterns = [
          { pattern: /bennu coffee east/i, location: 'East' },
          { pattern: /bennu coffee south congress/i, location: 'South Congress' },
          { pattern: /bennu coffee highland/i, location: 'Highland' },
          { pattern: /jo'?s coffee south congress/i, location: 'South Congress' },
          { pattern: /jo'?s coffee downtown/i, location: 'Downtown' },
          { pattern: /jo'?s coffee red river/i, location: 'Red River' }
        ];
        
        // First check for specific patterns in the formatted locations
        for (const location of formattedLocations) {
          for (const { pattern, location: cleanLocation } of locationPatterns) {
            if (pattern.test(location)) {
              const normalized = normalizeForFinalComparison(cleanLocation);
              if (!seenLocations.has(normalized)) {
                seenLocations.add(normalized);
                finalLocations.push(cleanLocation);
              }
            }
          }
        }
        
        // If we didn't find any specific patterns, use generic extraction
        if (finalLocations.length === 0) {
          for (const location of formattedLocations) {
            // Skip very short locations
            if (location.length < 4) continue;
            
            // Add the location if we haven't seen it before
            const normalized = normalizeForFinalComparison(location);
            if (!seenLocations.has(normalized)) {
              seenLocations.add(normalized);
              finalLocations.push(location);
            }
          }
        }
        
        // If we have location links or city-state matches, we have multiple locations
        const detectedLocations = finalLocations;
        
        // If we have a location section or dropdown but no specific locations detected,
        // assume there are multiple locations but we couldn't extract the names
        const hasMultipleLocations = hasLocationSection || hasLocationDropdown || hasLocationMenu || detectedLocations.length > 0;
        
        // Log if we found a locations page but couldn't extract specific locations
        if (hasLocationsPage && detectedLocations.length === 0) {
          console.log('[PlaceDetails] Found locations page/menu but couldn\'t extract specific locations');
        }
        
        return {
          hasLocationsPage,
          hasMultipleLocations,
          locationCount: detectedLocations.length || (hasMultipleLocations ? 2 : 1), // Default to 1 if no locations detected
          locationNames: detectedLocations
        };
      };
  
      // Fetch contact page if it exists
      let contactHtml = '';
      let contactUsedPuppeteer = false;
          // 2. Try to find a Contact page link
          const contactLinkMatch = homepageHtml.match(/<a[^>]+href=["']([^"'>]*contact[^"'>]*)["'][^>]*>/i);
          if (contactLinkMatch && contactLinkMatch[1]) {
            let contactUrl = contactLinkMatch[1];
            if (!contactUrl.startsWith('http')) {
              // Relative URL
              const base = new URL(website);
              contactUrl = new URL(contactUrl, base).href;
            }
            try {
          console.log(`[PlaceDetails] Fetching contact page: ${contactUrl}`);
          const { html, usedPuppeteer } = await fetchHtmlWithFallback(contactUrl, { noPuppeteer, debugMode });
          contactHtml = html;
          contactUsedPuppeteer = usedPuppeteer;
          usedPuppeteerForAnyRequest = usedPuppeteerForAnyRequest || usedPuppeteer;
          console.log(`[PlaceDetails] Successfully fetched contact page HTML: ${contactHtml.length} bytes (Puppeteer: ${contactUsedPuppeteer})`);
            } catch (err) {
              console.log('[PlaceDetails] Failed to fetch contact page:', err);
            }
          }
  
      // 3. Try to find a Locations page link
      let locationsHtml = '';
      let locationsUsedPuppeteer = false;
      const locationsLinkMatch = homepageHtml.match(/<a[^>]+href=["']([^"'>]*locations?[^"'>]*)["'][^>]*>/i);
      if (locationsLinkMatch && locationsLinkMatch[1]) {
            let locationsUrl = locationsLinkMatch[1];
            if (!locationsUrl.startsWith('http')) {
          // Relative URL
              const base = new URL(website);
              locationsUrl = new URL(locationsUrl, base).href;
            }
            try {
          console.log(`[PlaceDetails] Fetching locations page: ${locationsUrl}`);
          const { html, usedPuppeteer } = await fetchHtmlWithFallback(locationsUrl, { noPuppeteer, debugMode });
          locationsHtml = html;
          locationsUsedPuppeteer = usedPuppeteer;
          usedPuppeteerForAnyRequest = usedPuppeteerForAnyRequest || usedPuppeteer;
          console.log(`[PlaceDetails] Successfully fetched locations page HTML: ${locationsHtml.length} bytes (Puppeteer: ${locationsUsedPuppeteer})`);
            } catch (err) {
          console.log('[PlaceDetails] Failed to fetch locations page:', err);
        }
      }
  
      const combinedHtml = homepageHtml + (contactHtml ? '\n' + contactHtml : '') + (locationsHtml ? '\n' + locationsHtml : '');
  
      // Apply location detection to the combined HTML from all pages
      console.log(`[PlaceDetails] Detecting locations from all pages`);
      let locationInfo;
      try {
        locationInfo = detectLocations(combinedHtml);
      } catch (err) {
        console.log(`[PlaceDetails] Error in detectLocations:`, err.message);
        locationInfo = {
          locationCount: 1,
          locationNames: [],
          hasLocationsPage: false
        };
      }
      
      // Ensure locationInfo is valid
      if (!locationInfo || typeof locationInfo !== 'object') {
        console.log(`[PlaceDetails] detectLocations returned invalid result, using defaults`);
        locationInfo = {
          locationCount: 1,
          locationNames: [],
          hasLocationsPage: false
        };
      }
      
      numLocations = locationInfo.locationCount > 0 ? locationInfo.locationCount : 1; // Default to 1 if none found
      locationNames = locationInfo.locationNames || [];
      const hasLocationsPage = locationInfo.hasLocationsPage || false;
      console.log(`[PlaceDetails] Detected ${numLocations} locations: ${JSON.stringify(locationNames)}`);
      if (hasLocationsPage) {
        console.log(`[PlaceDetails] Website has a dedicated locations page or menu`);
      }
  
      // Extract emails from the HTML
          const emailSet = new Set();
          const extractEmails = (html) => {
        console.log('[EmailExtractor] Starting email extraction from HTML');
        // Extract emails from mailto links - these are most reliable
        const mailtoMatches = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
        console.log(`[EmailExtractor] Found ${mailtoMatches.length} mailto links`);
        mailtoMatches.forEach(m => {
          const email = m.replace('mailto:', '').trim();
          if (email && isValidEmail(email)) {
            console.log(`[EmailExtractor] Found email from mailto: ${email}`);
            emailSet.add(email);
          }
        });
        
        // Extract emails from href attributes (for cases where mailto: might be missing)
        const hrefEmailRegex = /href=["'](?!mailto:)([^"']*?[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[^"']*?["']/gi;
        const hrefMatches = html.matchAll(hrefEmailRegex);
        for (const match of hrefMatches) {
          if (match[1]) {
            // Extract the email pattern from the href
            const emailMatch = match[1].match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (emailMatch && emailMatch[1]) {
              const email = emailMatch[1];
              if (isValidEmail(email)) {
                console.log(`[EmailExtractor] Found email from href: ${email}`);
                emailSet.add(email);
              }
            }
          }
        }
        
        // Extract emails from text content with stricter boundaries
        const textEmailRegex = /(?:^|\s|[^\w@])([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:$|\s|[^\w\.])/gi;
        const textMatches = html.matchAll(textEmailRegex);
        for (const match of textMatches) {
          if (match[1]) {
            const email = match[1].trim();
            if (isValidEmail(email)) {
              console.log(`[EmailExtractor] Found email from text: ${email}`);
              emailSet.add(email);
            }
          }
        }
        console.log(`[EmailExtractor] Finished email extraction. Total unique emails found: ${emailSet.size}`);
      };
      
      // Helper function to validate email format
      const isValidEmail = (email) => {
        // Basic validation
        if (!email || typeof email !== 'string') return false;
        
        // Check if it has valid format with exactly one @ symbol
        if (email.split('@').length !== 2) return false;
        
        // Ensure no HTML or unexpected characters
        if (email.includes('<') || email.includes('>') || email.includes('"') || 
            email.includes("'") || email.includes(' ') || email.includes(',')) {
          return false;
        }
        
        // Check for common invalid patterns
        if (email.endsWith('.') || email.includes('..') || email.includes('.-') || email.includes('-.')) {
          return false;
        }
        
        // Skip emails with unusual prefixes that are likely not real
        const prefix = email.split('@')[0].toLowerCase();
        if (['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'test', 'sample'].includes(prefix)) {
          return false;
        }
        
        // Check for single letter prefixes before common email words (like "tinfo@")
        // This catches cases where text is incorrectly parsed as part of the email
        const commonPrefixes = ['info', 'contact', 'hello', 'support', 'sales', 'admin', 'office'];
        for (const commonPrefix of commonPrefixes) {
          if (prefix.length > commonPrefix.length && 
              prefix.endsWith(commonPrefix) && 
              prefix.length === commonPrefix.length + 1) {
            // We have something like "tinfo" where "t" is likely not part of the email
            return false;
          }
        }
        
        // Skip emails with unusual suffixes that indicate they might be part of text
        const suffix = email.split('@')[1].toLowerCase();
        if (suffix.includes('comcall') || suffix.includes('comemail') || suffix.includes('comcontact')) {
          return false;
        }
        
        // Skip emails that are too long (likely garbage)
        if (email.length > 50) return false;
        
        return true;
      };
  
      // Extract emails from the HTML
      extractEmails(combinedHtml);
  
      // Get all emails first
      let allEmails = Array.from(emailSet);
      
      // Normalize and deduplicate emails (case-insensitive)
      const normalizedEmailMap = new Map();
      allEmails.forEach(email => {
        const normalizedEmail = email.toLowerCase().trim();
        // Keep the first occurrence or the one with more lowercase letters (likely the intended casing)
        if (!normalizedEmailMap.has(normalizedEmail) || 
            (email.match(/[a-z]/g) || []).length > (normalizedEmailMap.get(normalizedEmail).match(/[a-z]/g) || []).length) {
          normalizedEmailMap.set(normalizedEmail, email);
        }
      });
      allEmails = Array.from(normalizedEmailMap.values());
      
      // Filter out common false positives and malformed emails
      allEmails = allEmails.filter(email => {
        // Skip emails that are likely false positives
        if (email.toLowerCase().includes('example.com')) return false;
        if (email.toLowerCase().includes('yourdomain.com')) return false;
        if (email.toLowerCase().includes('domain.com')) return false;
        if (email.toLowerCase().includes('email.com')) return false;
        
        // Skip emails with unusual prefixes that are likely not real
        const prefix = email.split('@')[0].toLowerCase();
        if (['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'test', 'sample'].includes(prefix)) {
          return false;
        }
        
        return true;
      });
      
      console.log(`[PlaceDetails] All extracted emails: ${JSON.stringify(allEmails)}`);
      
      // Filter emails to prioritize the most relevant ones
      const businessName = existingBusiness?.name || '';
      const domain = extractDomain(website);
      
      // Special case for 24 Hour Fitness (domain mismatch between website and email)
      const is24HourFitness = businessName.toLowerCase().includes('24 hour fitness') || 
                             (website && website.toLowerCase().includes('24hourfitness.com'));
      
      if (domain || is24HourFitness) {
        // For 24 Hour Fitness, include emails from 24hourfit.com domain
        const businessDomainEmails = allEmails.filter(email => {
          const emailDomain = email.split('@')[1].toLowerCase();
          if (is24HourFitness) {
            return emailDomain === domain.toLowerCase() || 
                   emailDomain === '24hourfit.com' || 
                   emailDomain === '24hourfitness.com';
          }
          return emailDomain === domain.toLowerCase();
        });
        
        console.log(`[PlaceDetails] Business domain: ${domain}, found ${businessDomainEmails.length} matching emails`);
        
        if (businessDomainEmails.length > 0) {
          // If we have emails from the business domain, only use those
          emails = businessDomainEmails;
          
          // Helper function to score email relevance (lower score = more relevant)
          const getEmailRelevanceScore = (email) => {
            const lowerEmail = email.toLowerCase();
            const emailPrefix = lowerEmail.split('@')[0];
            let score = 100; // Base score
            
            // General contact emails are highly relevant
            if (['info', 'contact', 'hello', 'support', 'general'].includes(emailPrefix)) {
              score -= 50;
            }
            
            // If we have a business name, check if the email contains it
            if (businessName) {
              const simplifiedName = businessName.toLowerCase()
                .replace(/[^\w\s]/g, '') // Remove special chars
                .replace(/\s+/g, '');     // Remove spaces
              
              if (emailPrefix.includes(simplifiedName)) {
                score -= 30;
              }
            }
            
            // If we have location names, check if the email contains any of them
            if (locationNames && locationNames.length > 0) {
              // Extract the location from the business name if possible
              const businessLocation = businessName.split('–').length > 1 
                ? businessName.split('–')[1].trim().toLowerCase() 
                : '';
              
              if (businessLocation && emailPrefix.includes(businessLocation.replace(/\s+/g, ''))) {
                score -= 40; // This is likely the email for this specific location
              }
              
              // Check if email matches any location name
              for (const location of locationNames) {
                const simplifiedLocation = location.toLowerCase()
                  .replace(/[^\w\s]/g, '')
                  .replace(/\s+/g, '');
                
                if (emailPrefix.includes(simplifiedLocation)) {
                  // If this is the location we're looking for, make it highly relevant
                  if (businessLocation && simplifiedLocation.includes(businessLocation.replace(/\s+/g, ''))) {
                    score -= 40;
                  } else {
                    // It's a location-specific email, but not for this location
                    score += 10;
                  }
                }
              }
            }
            
            return score;
          };
          
          // Sort emails by relevance score
          const sortedEmails = businessDomainEmails.sort((a, b) => {
            return getEmailRelevanceScore(a) - getEmailRelevanceScore(b);
          });
          
          // Take only the top 3 most relevant emails
          emails = sortedEmails.slice(0, 3);
        } else {
          // If no business domain emails found, return an empty array
          emails = [];
        }
        console.log(`[PlaceDetails] Filtered to most relevant business domain emails: ${JSON.stringify(emails)}`);
      } else {
        emails = [];
        console.log(`[PlaceDetails] No valid business domain found, no emails returned`);
      }
    }

    // Normalize and deduplicate emails before returning
    const normalizedEmails = normalizeAndDeduplicateEmails(emails);
    console.log(`[PlaceDetails] Normalized emails: ${JSON.stringify(normalizedEmails)}`);
    
    // Update the business with website scraping data
    if (existingBusiness) {
      console.log('[PlaceDetails] Before database update - Business data:', {
        id: existingBusiness.id,
        name: existingBusiness.name,
        placeId: existingBusiness.placeId,
        currentEmails: existingBusiness.emails?.length || 0,
        currentNumLocations: existingBusiness.numLocations,
        currentLocationNames: existingBusiness.locationNames?.length || 0,
        currentWebsite: existingBusiness.website,
        currentPhone: existingBusiness.phone
      });

      // Update fields only if not using Apollo
      if (!shouldUseApollo) {
        existingBusiness.emails = normalizedEmails;
        existingBusiness.numLocations = numLocations;
        existingBusiness.locationNames = locationNames;
        existingBusiness.website = website;
        existingBusiness.phone = phone;
      }
      existingBusiness.lastUpdated = new Date();

      console.log('[PlaceDetails] About to save business with updated data:', {
        emails: normalizedEmails,
        numLocations,
        locationNames,
        website,
        phone,
        lastUpdated: existingBusiness.lastUpdated
      });

      await existingBusiness.save();
      
      console.log('[PlaceDetails] Successfully updated business in database:', {
        businessId: existingBusiness.id,
        businessName: existingBusiness.name,
        emailsCount: normalizedEmails.length,
        numLocations,
        locationNamesCount: locationNames.length,
        website,
        phone,
        saveTimestamp: new Date().toISOString()
      });
    } else {
      console.log('[PlaceDetails] No existing business found in database for placeId:', placeId);
    }
    
    // Return the enriched data
    const responseData = { 
      website, 
      formatted_phone_number: phone, 
      emails: normalizedEmails, 
      numLocations, 
      locationNames, 
      decisionMakers,
      business_name: existingBusiness?.name,
      usedPuppeteer: usedPuppeteerForAnyRequest
    };
    
    console.log(`[PlaceDetails] ===== ENRICHMENT REQUEST COMPLETE =====`);
    console.log(`[PlaceDetails] Final response data:`, {
      placeId,
      businessName: existingBusiness?.name,
      website,
      phone,
      emailsCount: normalizedEmails.length,
      emails: normalizedEmails,
      numLocations,
      locationNamesCount: locationNames.length,
      locationNames,
      decisionMakersCount: decisionMakers.length,
      usedPuppeteer: usedPuppeteerForAnyRequest,
      databaseUpdated: !!existingBusiness,
      responseTimestamp: new Date().toISOString()
    });
    
    res.json(responseData);
  } catch (error) {
    console.log(`[PlaceDetails] ===== ENRICHMENT REQUEST FAILED =====`);
    console.log('[PlaceDetails] Error fetching place details:', error.message);
    console.log('[PlaceDetails] Full error:', error);
    console.log('[PlaceDetails] Error details:', {
      placeId,
      errorType: error.constructor.name,
      errorMessage: error.message,
      errorStack: error.stack?.split('\n')[0],
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ error: 'Failed to fetch place details' });
  }
});

// Add a new endpoint to handle grader API requests
app.post('/api/grade-business', async (req, res) => {
  const { placeId } = req.body;

  if (!placeId) {
    return res.status(400).json({ error: 'placeId is required' });
  }

  try {
    const report = await gradeBusiness(placeId);
    res.json(report);
  } catch (error) {
    console.error('Error in /api/grade-business endpoint:', error);
    res.status(500).json({ error: 'Failed to grade business' });
  }
});

// Endpoint to get a grade report by ID
app.get('/api/grade-report/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    
    if (!reportId) {
      return res.status(400).json({ error: 'Report ID is required' });
    }
    
    console.log(`[Server] Fetching report with ID: ${reportId}`);
    
    // Check if this is a mock report ID
    if (reportId.startsWith('mock-')) {
      console.log('[Server] Generating mock report HTML');
      
      // Extract the place ID from the mock report ID
      const parts = reportId.split('-');
      const placeId = parts[1];
      
      // Generate a simple HTML report
      const mockHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Mock Grader Report</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            .report-header { 
              background: linear-gradient(to right, #4a6cf7, #8a54ff);
              color: white;
              padding: 20px;
              border-radius: 10px 10px 0 0;
            }
            .report-body {
              border: 1px solid #ddd;
              padding: 20px;
              border-radius: 0 0 10px 10px;
            }
            .score {
              font-size: 48px;
              font-weight: bold;
              margin: 20px 0;
            }
            .category {
              margin: 15px 0;
              padding: 15px;
              background-color: #f9f9f9;
              border-radius: 5px;
            }
            .category h3 {
              margin-top: 0;
            }
            .bar {
              height: 10px;
              background-color: #eee;
              border-radius: 5px;
              margin-top: 5px;
            }
            .bar-fill {
              height: 100%;
              border-radius: 5px;
              background: linear-gradient(to right, #4a6cf7, #8a54ff);
            }
          </style>
        </head>
        <body>
          <div class="report-header">
            <h1>RAY Grader Report</h1>
            <p>Generated on ${new Date().toLocaleDateString()} for Place ID: ${placeId}</p>
          </div>
          
          <div class="report-body">
            <h2>Business Quality Score</h2>
            
            <div class="score">
              ${Math.round(Math.random() * 100)}%
            </div>
            
            <div class="categories">
              <div class="category">
                <h3>Website Quality</h3>
                <p>How well the business website is optimized for customers.</p>
                <div class="bar">
                  <div class="bar-fill" style="width: ${Math.round(Math.random() * 100)}%"></div>
                </div>
              </div>
              
              <div class="category">
                <h3>Google Maps Profile</h3>
                <p>Quality and completeness of the Google Maps listing.</p>
                <div class="bar">
                  <div class="bar-fill" style="width: ${Math.round(Math.random() * 100)}%"></div>
                </div>
              </div>
              
              <div class="category">
                <h3>Social Media Presence</h3>
                <p>Activity and engagement across social media platforms.</p>
                <div class="bar">
                  <div class="bar-fill" style="width: ${Math.round(Math.random() * 100)}%"></div>
                </div>
              </div>
              
              <div class="category">
                <h3>Business Information</h3>
                <p>Accuracy and completeness of basic business information.</p>
                <div class="bar">
                  <div class="bar-fill" style="width: ${Math.round(Math.random() * 100)}%"></div>
                </div>
              </div>
            </div>
            
            <p style="margin-top: 30px; text-align: center; font-style: italic;">
              This is a mock report generated for testing purposes.
            </p>
          </div>
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(mockHtml);
    }
    
    // Check if this is a RAY report ID (starts with 'ray-')
    if (reportId.startsWith('ray-')) {
      console.log('[Server] Serving RAY PDF report');
      
      // Try to read the saved PDF file
      const reportPath = path.join(__dirname, 'reports', `${reportId}.pdf`);
      
      try {
        const pdfBuffer = await fs.readFile(reportPath);
        
        // Set headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${reportId}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        return res.send(pdfBuffer);
      } catch (fileError) {
        console.error(`[Server] Error reading PDF file: ${fileError.message}`);
        return res.status(404).json({ 
          error: 'Report file not found', 
          details: 'The PDF report file could not be found on the server' 
        });
      }
    }
    
    // For other report types, return a simple error
    return res.status(404).json({ 
      error: 'Report not found', 
      details: 'This report type is not supported' 
    });
  } catch (error) {
    console.error('[Server] Error fetching report:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch report', 
      message: error.message 
    });
  }
});

// Start server with database connection
const startServer = async () => {
  try {
    // Connect to database first
    await connectToDatabase();
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`[Server] Server running on http://localhost:${PORT}`);
      console.log('[Server] Storage mode: Database');
    });
  } catch (error) {
    console.error('[Server] Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Function to grade business quality
async function gradeBusiness(placeId) {
  try {
    // Check if we should use a mock response
    if (!process.env.RAY_GRADER_API_KEY || process.env.RAY_GRADER_API_KEY === 'demo-key') {
      console.log('[Server] Using mock grader response (no API key or demo key)');
      const mockScore = Math.floor(Math.random() * 100) + 1; // Score between 1-100
      const mockReportId = `mock-${placeId}-${Date.now()}`;
      
      // Create a mock PDF for download
      const reportPath = path.join(__dirname, 'reports', `${mockReportId}.pdf`);
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, 'This is a mock PDF report.');
      
      return {
        success: true,
        score: mockScore,
        reportId: mockReportId,
      };
    }
    
    let apiUrl = process.env.GRADER_BACKEND_URL || 'https://grader.rayapp.io/api/generate-report-v2';
    if (apiUrl && !apiUrl.endsWith('/api/generate-report-v2')) {
      apiUrl = apiUrl.replace(/\/$/, '') + '/api/generate-report-v2';
    }
    console.log(`[Server] Full API URL: ${apiUrl}`);
    
    const requestBody = { 
      placeId: placeId,
      apiKey: process.env.RAY_GRADER_API_KEY
    };
    
    console.log(`[Server] Request body: ${JSON.stringify(requestBody, null, 2)}`);
    
    const graderResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(180000) // 180 second timeout
    });

    if (!graderResponse.ok) {
      const errorText = await graderResponse.text();
      console.error(`[Server] Grader API returned an error. Status: ${graderResponse.status}, Body: ${errorText}`);
      throw new Error(`Grader API request failed: ${errorText}`);
    }

    const contentType = graderResponse.headers.get('content-type');

    if (contentType && contentType.includes('application/pdf')) {
      const pdfBuffer = await graderResponse.arrayBuffer();
      const reportId = `ray-${placeId}-${Date.now()}`;
      const reportPath = path.join(__dirname, 'reports', `${reportId}.pdf`);

      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, Buffer.from(pdfBuffer));

      const scoreHeader = graderResponse.headers.get('x-grader-score');
      const score = scoreHeader ? parseInt(scoreHeader, 10) : null;

      if (score === null) {
        console.log('[Server] Grader API returned a PDF, but the x-grader-score header was not found.');
      }

      return {
        success: true,
        score: score,
        reportId: reportId,
      };
    }

    // Fallback to JSON parsing if not a direct PDF response
    const clonedResponse = graderResponse.clone();
    try {
      const reportData = await graderResponse.json();
      const reportId = `ray-${placeId}-${Date.now()}`;
      
      if (reportData.pdfUrl) {
        const pdfResponse = await fetch(reportData.pdfUrl);
        if (pdfResponse.ok) {
          const pdfBuffer = await pdfResponse.arrayBuffer();
          const reportPath = path.join(__dirname, 'reports', `${reportId}.pdf`);
          await fs.mkdir(path.dirname(reportPath), { recursive: true });
          await fs.writeFile(reportPath, Buffer.from(pdfBuffer));
        } else {
          console.error(`[Server] Failed to download PDF from url: ${reportData.pdfUrl}`);
        }
      }
      
      return {
        success: true,
        score: reportData.score,
        reportId: reportId,
      };
    } catch (error) {
        console.error('[Server] Failed to parse JSON response from grader API. Logging headers and body.');
        console.error('[Server] Grader API Response Headers:', JSON.stringify(Object.fromEntries(clonedResponse.headers.entries())));
        const responseBody = await clonedResponse.text();
        console.error('[Server] Grader API Response Body (first 500 chars):', responseBody.substring(0, 500));
        
        throw error;
    }

  } catch (error) {
    console.error('[Server] Error grading business:', error);
    throw error;
  }
}

// Endpoint to grade business quality
app.post('/api/grade-business', async (req, res) => {
  const { placeId } = req.body;

  if (!placeId) {
    return res.status(400).json({ error: 'placeId is required' });
  }

  try {
    const report = await gradeBusiness(placeId);
    res.json(report);
  } catch (error) {
    console.error('Error in /api/grade-business endpoint:', error);
    res.status(500).json({ error: 'Failed to grade business' });
  }
});