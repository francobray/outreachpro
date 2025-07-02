import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the project root (parent directory)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for businesses
let businesses = [];

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

// API Routes

// Search businesses using Google Places API (real implementation)
app.post('/api/search', async (req, res) => {
  const { location, keyword } = req.body;
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
    
    // Add to businesses storage if not already exists
    mockBusinesses.forEach(business => {
      const exists = businesses.find(b => b.placeId === business.placeId);
      if (!exists) {
        businesses.push(business);
      }
    });
    
    return res.json({ businesses: mockBusinesses });
  }

  try {
    // Geocode the location to get lat/lng
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
    console.log('[Search] Geocoding request URL:', geocodeUrl.replace(apiKey, 'API_KEY_HIDDEN'));
    
    const geoRes = await fetch(geocodeUrl);
    const geoData = await geoRes.json();
    console.log('[Search] Geocoding response status:', geoRes.status);
    console.log('[Search] Geocoding response:', JSON.stringify(geoData, null, 2));
    
    if (!geoData.results || geoData.results.length === 0) {
      console.log('[Search] Location not found in Google Places API, using mock data');
      const mockBusinesses = generateMockBusinesses(keyword, location);
      
      // Add to businesses storage if not already exists
      mockBusinesses.forEach(business => {
        const exists = businesses.find(b => b.placeId === business.placeId);
        if (!exists) {
          businesses.push(business);
        }
      });
      
      return res.json({ businesses: mockBusinesses });
    }
    const { lat, lng } = geoData.results[0].geometry.location;
    console.log('[Search] Geocoded coordinates:', { lat, lng });

    // Search for places
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&keyword=${encodeURIComponent(keyword)}&key=${apiKey}`;
    console.log('[Search] Places search request URL:', placesUrl.replace(apiKey, 'API_KEY_HIDDEN'));
    
    const placesRes = await fetch(placesUrl);
    const placesData = await placesRes.json();
    console.log('[Search] Places search response status:', placesRes.status);
    console.log('[Search] Places search response:', JSON.stringify(placesData, null, 2));

    // Map Google results to your business format
    const businessesFound = (placesData.results || []).map(place => ({
      id: place.place_id,
      name: place.name,
      address: place.vicinity,
      website: null, // Can be fetched with details lookup if needed
      placeId: place.place_id,
      phone: '', // Can be fetched with details lookup if needed
      emails: [],
      auditReport: null,
      emailStatus: 'pending',
      addedAt: new Date().toISOString(),
      types: place.types || [],
      rating: place.rating || null,
      userRatingsTotal: place.user_ratings_total || null,
    }));

    console.log('[Search] Found businesses:', businessesFound.length);

    // Add to businesses storage if not already exists
    businessesFound.forEach(business => {
      const exists = businesses.find(b => b.placeId === business.placeId);
      if (!exists) {
        businesses.push(business);
      }
    });

    res.json({ businesses: businessesFound });
  } catch (error) {
    console.log('[Search] Google Places API error, using mock data:', error.message);
    console.log('[Search] Full error:', error);
    const mockBusinesses = generateMockBusinesses(keyword, location);
    
    // Add to businesses storage if not already exists
    mockBusinesses.forEach(business => {
      const exists = businesses.find(b => b.placeId === business.placeId);
      if (!exists) {
        businesses.push(business);
      }
    });
    
    res.json({ businesses: mockBusinesses });
  }
});

// Generate audit report for a business
app.post('/api/audit/:businessId', (req, res) => {
  const { businessId } = req.params;
  const business = businesses.find(b => b.id === businessId);
  
  if (!business) {
    return res.status(404).json({ error: 'Business not found' });
  }
  
  // Simulate API delay
  setTimeout(() => {
    const auditReport = generateMockAuditReport(business.name, business.website);
    
    // Update business with audit report
    business.auditReport = auditReport;
    
    res.json({ auditReport });
  }, 2000);
});

// Find emails for a business (mocked)
app.post('/api/emails/:businessId', async (req, res) => {
  const { businessId } = req.params;
  console.log(`[Apollo] /api/emails/${businessId} endpoint hit`);
  const business = businesses.find(b => b.id === businessId);

  if (!business) {
    console.log(`[Apollo] Business not found for id: ${businessId}`);
    return res.status(404).json({ error: 'Business not found' });
  }

  try {
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
    }

    // 2. Use org_id or domain to search for decision makers
    let peopleBody = {
      api_key: apolloApiKey,
      person_titles: ['Owner', 'Marketing Executive', 'Marketing Director', 'Marketing Manager'],
      page: 1,
      per_page: 3,
    };
    if (orgId) {
      peopleBody['organization_ids'] = [orgId];
    } else if (domain) {
      peopleBody['q_organization_domains'] = [domain];
    } else {
      peopleBody['q_organization_names'] = [business.name];
    }
    console.log('[Apollo] People API request:', peopleBody);
    const peopleRes = await fetch('https://api.apollo.io/v1/mixed_people/search', {
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

    // Extract emails and names
    const emails = (peopleData.people || []).map(person => person.email).filter(Boolean);
    business.emails = emails;

    // Store decision makers info
    business.decisionMakers = (peopleData.people || []).map(person => ({
      name: person.name,
      title: person.title,
      email: person.email,
      linkedin_url: person.linkedin_url,
    }));

    res.json({ emails, decisionMakers: business.decisionMakers, enriched: business.enriched });
  } catch (error) {
    console.error('[Apollo] Enrich/People API error:', error);
    res.status(500).json({ error: 'Failed to fetch from Apollo Enrich/People API' });
  }
});

// Send outreach email (mocked)
app.post('/api/send-email/:businessId', (req, res) => {
  const { businessId } = req.params;
  const { subject, message, recipientEmail } = req.body;
  const business = businesses.find(b => b.id === businessId);
  
  if (!business) {
    return res.status(404).json({ error: 'Business not found' });
  }
  
  // Simulate email sending delay
  setTimeout(() => {
    business.emailStatus = 'sent';
    business.lastEmailSent = new Date().toISOString();
    
    res.json({ 
      success: true, 
      message: 'Email sent successfully',
      sentTo: recipientEmail,
      sentAt: new Date().toISOString()
    });
  }, 1000);
});

// Download audit report PDF (mocked)
app.get('/api/reports/:reportId/download', (req, res) => {
  const { reportId } = req.params;
  
  // Find the business with this report
  const business = businesses.find(b => b.auditReport?.id === reportId);
  
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
});

// Get all businesses in dashboard
app.get('/api/dashboard', (req, res) => {
  res.json({ businesses });
});

// Clear all data (for testing)
app.delete('/api/clear', (req, res) => {
  businesses = [];
  res.json({ message: 'All data cleared' });
});

app.get('/api/place-details/:placeId', async (req, res) => {
  const { placeId } = req.params;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  console.log(`[PlaceDetails] Endpoint hit for placeId: ${placeId}`);
  
  if (!apiKey) {
    console.log('[PlaceDetails] No Google Places API key');
    return res.status(500).json({ error: 'No Google Places API key' });
  }
  if (!geminiApiKey) {
    console.log('[PlaceDetails] No Gemini API key');
    return res.status(500).json({ error: 'No Gemini API key' });
  }

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website,formatted_phone_number&key=${apiKey}`;
  console.log('[PlaceDetails] Outgoing URL:', url.replace(apiKey, 'API_KEY_HIDDEN'));

  try {
    const response = await fetch(url);
    console.log('[PlaceDetails] Google API response status:', response.status);
    const data = await response.json();

    //retrieve website and phone number from google places api
    const website = data.result?.website || null;
    const phone = data.result?.formatted_phone_number || null;

    console.log('[PlaceDetails] Website:', website);
    console.log('[PlaceDetails] Phone:', phone);

    let emails = [];
    let numLocations = undefined;

    if (website) {
      try {
        // 1. Scrape homepage HTML
        const homepageRes = await fetch(website, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const homepageHtml = await homepageRes.text();
        let combinedHtml = homepageHtml;
        // 2. Try to find a Contact page link
        const contactLinkMatch = homepageHtml.match(/<a[^>]+href=["']([^"'>]*contact[^"'>]*)["'][^>]*>/i);
        let contactHtml = '';
        if (contactLinkMatch && contactLinkMatch[1]) {
          let contactUrl = contactLinkMatch[1];
          if (!contactUrl.startsWith('http')) {
            // Relative URL
            const base = new URL(website);
            contactUrl = new URL(contactUrl, base).href;
          }
          try {
            const contactRes = await fetch(contactUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            contactHtml = await contactRes.text();
            combinedHtml += '\n' + contactHtml;
          } catch (err) {
            console.log('[PlaceDetails] Failed to fetch contact page:', err);
          }
        }
        // 2b. Try to find a Locations page link
        const locationsLinkMatch = homepageHtml.match(/<a[^>]+href=["']([^"'>]*location[^"'>]*)["'][^>]*>/i);
        if (locationsLinkMatch && locationsLinkMatch[1] && geminiApiKey) {
          let locationsUrl = locationsLinkMatch[1];
          if (!locationsUrl.startsWith('http')) {
            const base = new URL(website);
            locationsUrl = new URL(locationsUrl, base).href;
          }
          try {
            const locationsRes = await fetch(locationsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            let locationsHtml = await locationsRes.text();
            // Remove all <svg>...</svg> blocks
            locationsHtml = locationsHtml.replace(/<svg[\s\S]*?<\/svg>/gi, '');
            // Send to Gemini to count locations
            const geminiPrompt = `How many business locations are listed in the following HTML? Return only a number.\n\nHTML:\n${locationsHtml}`;
            const geminiRequestBody = { contents: [{ parts: [{ text: geminiPrompt }] }] };
            
            console.log('[PlaceDetails] Gemini API URL:', 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=' + geminiApiKey.substring(0, 10) + '...');
            console.log('[PlaceDetails] Gemini prompt:', geminiPrompt);
            console.log('[PlaceDetails] Gemini request body:', JSON.stringify(geminiRequestBody, null, 2));
            
            const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=' + geminiApiKey, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(geminiRequestBody)
            });
            const geminiData = await geminiRes.json();
            console.log('[PlaceDetails] Gemini response for locations:', JSON.stringify(geminiData, null, 2));
            const geminiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const num = parseInt(geminiText.match(/\d+/)?.[0] || '', 10);
            if (!isNaN(num)) {
              numLocations = num;
            }
          } catch (err) {
            console.log('[PlaceDetails] Failed to fetch or process locations page:', err);
          }
        }
        // 3. Extract mailto emails from homepage and contact page HTML
        const emailSet = new Set();
        const extractEmails = (html) => {
          const matches = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) || [];
          matches.forEach(m => {
            const email = m.replace('mailto:', '').trim();
            if (email) emailSet.add(email);
          });
        };
        extractEmails(homepageHtml);
        if (contactHtml) extractEmails(contactHtml);
        emails = Array.from(emailSet);
      } catch (err) {
        console.log('[PlaceDetails] Error scraping website or extracting emails:', err);
      }
    }
    res.json({ website, formatted_phone_number: phone, emails, numLocations });
  } catch (err) {
    console.error('[PlaceDetails] Error:', err);
    res.status(500).json({ error: 'Failed to fetch place details' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});