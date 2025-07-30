import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  resetApiTracking,
  getApiTrackingStats,
  getMonthlyStats,
  getGooglePlacesCosts,
  getApolloCosts,
  fetchHtmlWithFallback,
  extractDomain,
  detectLocations,
  normalizeAndDeduplicateEmails,
} from './utils.js';

import Business from './models/Business.js';
import Campaign from './models/Campaign.js';
import EmailTemplate from './models/EmailTemplate.js';
import EmailActivity from './models/EmailActivity.js';
import ApiCallLog from './models/ApiCallLog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

async function enrichBusinessData(placeId, options = {}) {
  const { enrich = true, apollo = true, testUrl = '', disablePuppeteer = false, debug = false } = options;
  const noPuppeteer = disablePuppeteer;
  const debugMode = debug || process.env.DEBUG_SCRAPER === 'true';

  console.log(`[Enrichment] Starting for placeId: ${placeId}`);
  const existingBusiness = await Business.findOne({ placeId });

  if (!existingBusiness) {
    // This can happen if a business is deleted but an action is still triggered from the UI
    console.log(`[Enrichment] Business with placeId ${placeId} not found in database. Aborting enrichment.`);
    throw new Error('Business not found');
  }
  
  console.log(`[Enrichment] Found business. enrichedAt: ${existingBusiness.enrichedAt}`);

  // If business was recently enriched, return cached data
  if (existingBusiness.enrichedAt && enrich) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (new Date(existingBusiness.enrichedAt) > thirtyDaysAgo) {
      console.log('[Enrichment] Business recently enriched. Returning cached data.');
      return existingBusiness;
    }
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const apolloApiKey = process.env.APOLLO_API_KEY;

  // Always fetch from Google Places to get formatted_address and other details
  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,website,formatted_phone_number&key=${apiKey}`;
  try {
    const response = await fetch(detailsUrl);
    const data = await response.json();
    if (data.result) {
      existingBusiness.website = data.result.website || existingBusiness.website;
      existingBusiness.phone = data.result.formatted_phone_number || existingBusiness.phone;
      existingBusiness.address = data.result.formatted_address || existingBusiness.address;
    }
    // TODO: Log API call
  } catch (e) {
    console.log('[Enrichment] Google API error:', e.message);
  }

  let website = existingBusiness.website;
  if (testUrl) {
    website = testUrl;
  }
  
  let emails = [];
  let numLocations = undefined;
  let locationNames = [];
  let decisionMakers = [];

  if (enrich && website) {
    // 1. Scrape homepage HTML using progressive strategy
    console.log(`[Enrichment] Fetching website: ${website}`);
    const { html: homepageHtml, usedPuppeteer: homepageUsedPuppeteer } = await fetchHtmlWithFallback(website, { noPuppeteer, debugMode });

    // Detect locations from the homepage HTML
    console.log(`[Enrichment] Detecting locations from homepage HTML`);
    const { 
      numLocations: detectedNumLocations, 
      locationNames: detectedLocationNames, 
      usedPuppeteer: detectLocationsUsedPuppeteer 
    } = await detectLocations(homepageHtml, website, { noPuppeteer, debugMode });
    
    numLocations = detectedNumLocations;
    locationNames = detectedLocationNames;

    // Normalize and format location names
    if (locationNames.length > 0) {
      console.log(`[Enrichment] Raw location names found:`, locationNames);
      
      // Further refinement of location names to remove noise and duplicates
      const normalizeForComparison = (name) => {
        return name.toLowerCase()
          .replace(/<[^>]+>/g, '') // Remove HTML tags
          .replace(/[^\w\s]/g, '') // Remove punctuation
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
      };
      
      const uniqueNormalizedLocations = new Map();
      locationNames.forEach(name => {
        const normalized = normalizeForComparison(name);
        if (normalized && !uniqueNormalizedLocations.has(normalized)) {
          uniqueNormalizedLocations.set(normalized, name);
        }
      });
      
      // Format location names for better readability
      const formatLocationName = (name) => {
        return name
          .replace(/<[^>]+>/g, '') // Remove HTML tags
          .replace(/\s+/g, ' ') // Normalize whitespace
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
          .trim();
      };
      
      const formattedLocationNames = Array.from(uniqueNormalizedLocations.values()).map(formatLocationName);
      
      // Remove duplicates again after formatting
      const normalizeForFinalComparison = (name) => {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '');
      };
      
      const finalUniqueLocations = new Map();
      formattedLocationNames.forEach(name => {
        const normalized = normalizeForFinalComparison(name);
        if (normalized && !finalUniqueLocations.has(normalized)) {
          finalUniqueLocations.set(normalized, name);
        }
      });
      
      locationNames = Array.from(finalUniqueLocations.values());
      numLocations = locationNames.length;
      
      console.log(`[Enrichment] Refined location names:`, locationNames);
    } else {
      console.log('[Enrichment] No distinct locations detected on homepage.');
    }

    // 2. Extract emails
    const allEmails = [];
    const scrapedPages = new Set([website]); // Keep track of scraped pages

    // Find contact/about pages
    const findContactPages = (html) => {
      const contactPageRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
      const links = Array.from(html.matchAll(contactPageRegex));
      const contactKeywords = ['contact', 'about', 'team', 'staff', 'connect'];
      const contactPageUrls = new Set();

      for (const link of links) {
        const href = link[2];
        const text = link[3].toLowerCase();

        if (contactKeywords.some(keyword => text.includes(keyword) || href.includes(keyword))) {
          try {
            const absoluteUrl = new URL(href, website).href;
            contactPageUrls.add(absoluteUrl);
      } catch (error) {
            console.log(`[Enrichment] Invalid URL found: ${href}`);
          }
        }
      }
      return Array.from(contactPageUrls).slice(0, 3); // Limit to 3 pages to avoid excessive scraping
    };

    const extractEmails = (html) => {
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
      const foundEmails = html.match(emailRegex) || [];
      return foundEmails.filter(email => !email.endsWith('.png') && !email.endsWith('.gif') && !email.endsWith('.jpg'));
    };
    
    // Scrape emails from homepage
    allEmails.push(...extractEmails(homepageHtml));
    
    // Scrape emails from contact/about pages
    const contactPages = findContactPages(homepageHtml);
    if (contactPages.length > 0) {
      console.log(`[Enrichment] Found contact/about pages to scrape:`, contactPages);
      for (const pageUrl of contactPages) {
        if (!scrapedPages.has(pageUrl)) {
          try {
            console.log(`[Enrichment] Scraping for emails on: ${pageUrl}`);
            const { html: pageHtml, usedPuppeteer: pageUsedPuppeteer } = await fetchHtmlWithFallback(pageUrl, { noPuppeteer, debugMode });
            allEmails.push(...extractEmails(pageHtml));
            scrapedPages.add(pageUrl);
  } catch (error) {
            console.error(`[Enrichment] Error scraping page ${pageUrl}:`, error.message);
          }
        }
      }
    } else {
      console.log('[Enrichment] No valid contact/about pages found to scrape for emails.');
    }
    
    // Normalize and filter emails
    const isValidEmail = (email) => {
        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;

        // More robust domain validation
        const domainPart = email.split('@')[1];
        if (!domainPart || !domainPart.includes('.')) return false;
        const tld = domainPart.split('.').pop();
        if (tld.length < 2 || !/^[a-z]+$/i.test(tld)) return false;

        // Filter out common dummy/example emails
        if (['example.com', 'yourdomain.com', 'domain.com', 'email.com', 'mysite.com'].some(domain => email.endsWith(domain))) return false;
        
        // Filter out image file extensions
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].some(ext => email.toLowerCase().endsWith(ext))) return false;
        
        // Filter out package-like emails (e.g., core-js@3.2.1)
        if (/@[0-9]+\.[0-9]+\.[0-9]+$/.test(email)) return false;

        return true;
    };

    const normalizedEmails = normalizeAndDeduplicateEmails(allEmails.filter(isValidEmail));
    
    // Score emails based on relevance
    if (normalizedEmails.length > 0) {
        const domain = extractDomain(website);
      
        const getEmailRelevanceScore = (email) => {
        const lowerEmail = email.toLowerCase();
        let score = 0;
        
        // High score for matching domain
        if (domain && lowerEmail.endsWith(`@${domain}`)) {
          score += 100;
        }
        
        // High score for generic business-related prefixes
        const highValuePrefixes = ['info', 'contact', 'hello', 'support', 'sales', 'admin', 'office', 'press', 'media', 'help'];
        if (highValuePrefixes.some(prefix => lowerEmail.startsWith(prefix + '@'))) {
          score += 50;
        }
        
        // Lower score for generic email providers
        const lowValueDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
        if (lowValueDomains.some(d => lowerEmail.endsWith(`@${d}`))) {
          score -= 20;
        }
        
        // Penalty for generic names that are likely placeholders
        const placeholderNames = ['name@', 'firstname@', 'lastname@', 'email@', 'yourname@', 'test@', 'user@'];
        if (placeholderNames.some(p => lowerEmail.startsWith(p))) {
          score -= 50;
        }
        
        return score;
      };
      
      const scoredEmails = normalizedEmails.map(email => ({
        email,
        score: getEmailRelevanceScore(email)
      })).sort((a, b) => b.score - a.score);
      
      console.log(`[Enrichment] Scored emails:`, scoredEmails);
      
      emails = scoredEmails.filter(e => e.score > 0).map(e => e.email);
    }
    
    console.log(`[Enrichment] Normalized emails:`, emails);
  }

  // Call Apollo API to find decision makers - only if explicitly requested
  if (apollo) {
    if (existingBusiness && apolloApiKey) {
      try {
        const businessName = existingBusiness.name;
        const domain = existingBusiness.website ? extractDomain(existingBusiness.website) : null;
    let orgId = undefined;
    let enrichedOrg = undefined;

        // 1. Enrich the organization (only if we have a valid domain)
    if (domain) {
          console.log('[Enrichment] Apollo Enrich API request:', { domain, name: businessName });
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
          console.log('[Enrichment] Apollo Enrich API response:', JSON.stringify(enrichData, null, 2));
          if (enrichData.organization) {
      enrichedOrg = enrichData.organization;
            orgId = enrichedOrg.id;
          }
        } else {
          console.log('[Enrichment] Skipping Apollo organization enrichment: no domain available.');
        }
  
        // 2. Use org_id, domain, or name to search for decision makers
    let peopleBody = {
      api_key: apolloApiKey,
            person_titles: ['Owner', 'Founder', 'Co-Founder', 'Marketing Executive', 'Marketing Director', 'Marketing Manager', 'CEO', 'Chef Executive Officer', 'General Manager'],
      page: 1,
      per_page: 5,
      reveal_personal_emails: true,
      contact_email_status: ['verified', 'unverified'],
      show_personal_emails: true,
    };

    if (orgId) {
      peopleBody['organization_ids'] = [orgId];
    } else if (domain) {
      peopleBody['q_organization_domains'] = [domain];
    } else {
          console.log(`[Enrichment] Falling back to Apollo search by organization name: "${businessName}"`);
          peopleBody['q_organization_names'] = [businessName];
        }

        // Add location filtering only if we don't have a specific organization ID
        if (!orgId && existingBusiness.address) {
          let addressParts = existingBusiness.address.split(', ');
          
          let country = null;
          if (addressParts.length > 1 && /USA|United States/i.test(addressParts[addressParts.length - 1])) {
              country = addressParts.pop().trim();
          }

          if (isMajorBrand(existingBusiness.name)) {
              if (country) {
                  peopleBody['person_locations'] = [country];
                  console.log(`[Enrichment] Added location filter for major brand: ${country}`);
              } else {
                  console.log(`[Enrichment] Could not determine country for major brand, searching without location filter.`);
              }
          } else if (addressParts.length >= 2) {
              const city = addressParts[addressParts.length - 2].trim();
              const state = addressParts[addressParts.length - 1].trim().split(' ')[0];
              peopleBody['person_locations'] = [`${city}, ${state}`];
              console.log(`[Enrichment] Added location filter to Apollo search: ${city}, ${state}`);
          }
        }

        console.log('[Enrichment] Apollo People API request:', peopleBody);
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
          console.error(`[Enrichment] Apollo People API error: ${peopleRes.status}`, errorText);
          throw new Error(`Apollo People API failed with status ${peopleRes.status}`);
        }

        const peopleData = await peopleRes.json();
        console.log('[Enrichment] Apollo People API response:', JSON.stringify(peopleData, null, 2));
        console.log('[Enrichment] Apollo People API total entries:', peopleData.pagination?.total_entries || 0);

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
          try {
            const personData = enrichData.person;
            await ApiCallLog.create({
              api: 'apollo_person_match',
              timestamp: new Date(),
              details: {
                endpoint: 'person_match',
                personId: person.id,
              businessName: existingBusiness.name,
              placeId: existingBusiness.placeId,
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

        // Update the business in the database
        existingBusiness.decisionMakers = decisionMakers;
        existingBusiness.apolloAttempted = true;
        if (enrichedOrg) {
          existingBusiness.enriched = enrichedOrg;
        }
        await existingBusiness.save();
        console.log('[Enrichment] Saved Apollo decision makers to database:', {
          businessId: existingBusiness.id,
          decisionMakersCount: decisionMakers.length,
          apolloAttempted: true,
          decisionMakers: decisionMakers.map(dm => ({ name: dm.name, title: dm.title }))
        });

      } catch (error) {
          console.error('[Enrichment] Apollo API error:', error);
          // Even if Apollo API fails, we should still save that we attempted Apollo enrichment
          existingBusiness.decisionMakers = [];
          existingBusiness.apolloAttempted = true;
          await existingBusiness.save();
          console.log('[Enrichment] Saved empty Apollo decision makers due to API error');
      }
    } else {
      console.log('[Enrichment] Skipping Apollo enrichment: missing existing business data or API key.');
    }
  }

  // 3. Save the enriched data to the database
  if (existingBusiness) {
    const hasNewContacts = emails.length > 0 || decisionMakers.length > 0;
    const hasNewLocationInfo = numLocations !== undefined && numLocations > 0;

    // Only save if we found new, meaningful data
    if (hasNewContacts || hasNewLocationInfo) {
      existingBusiness.website = website;
      existingBusiness.emails = emails;
      existingBusiness.numLocations = numLocations;
      existingBusiness.locationNames = locationNames;
      existingBusiness.decisionMakers = decisionMakers;
      
      // Final save to capture all updates
      existingBusiness.enrichedAt = new Date();
      await existingBusiness.save();
      
      console.log('[Enrichment] Saved enriched data to database:', {
        businessId: existingBusiness.id,
        businessName: existingBusiness.name,
        website: existingBusiness.website,
        phone: existingBusiness.phone,
        emailsCount: existingBusiness.emails.length,
        numLocations: existingBusiness.numLocations,
        locationNamesCount: existingBusiness.locationNames.length,
        decisionMakersCount: decisionMakers.length,
        enrichedAt: existingBusiness.enrichedAt
      });
    } else {
      console.log('[Enrichment] No new meaningful data found. Skipping save to avoid bumping timestamp.');
    }
  }

  console.log('[Enrichment] Process complete.');
  return existingBusiness;
}


const isMajorBrand = (name) => {
    const majorBrands = [
        "7-eleven", "mcdonald's", "starbucks", "walmart", "subway", 
        "marriott", "hilton", "hyatt",
    ];
    const lowerCaseName = name.toLowerCase();
    return majorBrands.some(brand => lowerCaseName.includes(brand));
};

// Configuration endpoint
router.get('/config', (req, res) => {
    res.json({
      graderApiUrl: process.env.GRADER_API_URL || 'https://grader.rayapp.io/api/generate-report-v2',
      usingMock: !process.env.RAY_GRADER_API_KEY || process.env.RAY_GRADER_API_KEY === 'demo-key',
      storageMode: 'database',
      databaseConnected: true
    });
  });
  
  // Serve test HTML page
  router.get('/test-grader', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-grader.html'));
  });

  // Search businesses using Google Places API (real implementation)
router.post('/search', async (req, res) => {
  const { location, keyword, includeApollo = true } = req.body;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  console.log('[Search] Request received:', { location, keyword });
  console.log('[Search] API Key present:', !!apiKey);
  if (apiKey) {
    console.log('[Search] API Key (first 10 chars):', apiKey.substring(0, 10) + '...');
  }

  // If no API key, use mock data
  if (!apiKey) {
    console.log('[Search] No Google Places API key found, returning error');
    return res.status(500).json({ 
      error: 'Google Places API key not configured',
      message: 'The Google Places API key is missing. Please add it to the server configuration to enable search.' 
    });
  }

  try {
    // Geocode the location to get lat/lng
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
    console.log('[Search] Geocoding request URL:', geocodeUrl.replace(apiKey, 'API_KEY_HIDDEN'));
    
    const geoRes = await fetch(geocodeUrl);
    const geoData = await geoRes.json();
    console.log('[Search] Geocoding response status:', geoRes.status);
    
    if (!geoData.results || geoData.results.length === 0) {
      console.log('[Search] Location not found in Google Places API, returning error');
      return res.status(400).json({ 
        error: 'Location not found',
        message: `Could not find the location "${location}". Please try a different or more specific location.`
      });
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
    console.log('[Search] Google Places API error, returning error:', error.message);
    console.log('[Search] Full error:', error);
    res.status(500).json({ 
      error: 'Failed to search for businesses',
      message: 'An unexpected error occurred while trying to search for businesses. Please try again later.'
    });
  }
});

// Apollo-only enrichment for finding contacts
router.post('/apollo/enrich/:placeId', async (req, res) => {
  const { placeId } = req.params;
  const apolloApiKey = process.env.APOLLO_API_KEY;
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

  try {
    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    // Step 1: Ensure we have a website. If not, fetch from Google Places Details.
    if (!business.website && googleApiKey) {
      console.log(`[Apollo Enrich] Website not found for "${business.name}". Fetching from Google Places...`);
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website&key=${googleApiKey}`;
      try {
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();
        if (detailsData.result && detailsData.result.website) {
          business.website = detailsData.result.website;
          await business.save(); // Save website before proceeding
          console.log(`[Apollo Enrich] Found and saved website: ${business.website}`);
        } else {
          console.log(`[Apollo Enrich] No website found in Google Places Details for "${business.name}".`);
        }
      } catch (error) {
        console.error(`[Apollo Enrich] Error fetching Google Places Details:`, error);
      }
    }
    
    // Step 2: Call Apollo API to find decision makers
    const businessName = business.name;
    const domain = business.website ? extractDomain(business.website) : null;
    let orgId = undefined;

    if (domain) {
      const enrichRes = await fetch('https://api.apollo.io/v1/organizations/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': apolloApiKey },
        body: JSON.stringify({ api_key: apolloApiKey, domain, name: businessName }),
      });
      const enrichData = await enrichRes.json();
      if (enrichData.organization) {
        orgId = enrichData.organization.id;
      }
    }

    let peopleBody = {
      api_key: apolloApiKey,
      person_titles: ['Owner', 'Founder', 'Co-Founder', 'Marketing Executive', 'Marketing Director', 'Marketing Manager', 'CEO', 'Chef Executive Officer', 'General Manager'],
      page: 1,
      per_page: 5,
    };

    if (orgId) {
      peopleBody['organization_ids'] = [orgId];
    } else if (domain) {
      peopleBody['q_organization_domains'] = [domain];
    } else {
      peopleBody['q_organization_names'] = [businessName];
    }

    const peopleRes = await fetch('https://api.apollo.io/v1/people/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': apolloApiKey },
      body: JSON.stringify(peopleBody),
    });

    if (!peopleRes.ok) throw new Error(`Apollo People API failed with status ${peopleRes.status}`);

    const peopleData = await peopleRes.json();
    
    // Log the people search API call
    try {
      await ApiCallLog.create({
        api: 'apollo_people_search',
        timestamp: new Date(),
        details: {
          endpoint: 'people/search',
          businessName: business.name,
          placeId: business.placeId,
          foundContactsCount: peopleData.people?.length || 0
        }
      });
    } catch (error) {
      console.error('[Tracking] Error saving Apollo People Search API call to database:', error);
    }
    
    business.decisionMakers = peopleData.people || [];
    business.apolloAttempted = true;
    await business.save();

    res.json({
      emails: business.emails,
      decisionMakers: business.decisionMakers
    });

  } catch (error) {
    console.error(`[Apollo Enrich] Error for placeId ${placeId}:`, error);
    res.status(500).json({ error: 'Failed to fetch from Apollo API' });
  }
});

// Find emails for a business
router.post('/emails/:businessId', async (req, res) => {
  const { businessId } = req.params;
  console.log(`[Apollo] /api/emails/${businessId} endpoint hit`);
  
  try {
    const business = await Business.findOne({ placeId: businessId });
    if (!business) {
      console.log(`[Apollo] Business not found for id: ${businessId}`);
      return res.status(404).json({ error: 'Business not found' });
    }

    const enrichedBusiness = await enrichBusinessData(business.placeId, { enrich: false, apollo: true });

    res.json({ 
      emails: enrichedBusiness.emails, 
      decisionMakers: enrichedBusiness.decisionMakers, 
      enriched: enrichedBusiness.enriched 
    });
  } catch (error) {
    console.error('[Apollo] Error:', error);
    res.status(500).json({ error: 'Failed to fetch from Apollo API' });
  }
});

// Send outreach email
router.post('/send-email', async (req, res) => {
  const { resend } = req;
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
router.post('/webhooks/resend', async (req, res) => {
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
router.post('/test/webhook-simulation', async (req, res) => {
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
router.get('/email-activities', async (req, res) => {
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
  router.get('/apollo-pricing', async (req, res) => {
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
  router.post('/costs/reset', async (req, res) => {
    await resetApiTracking();
    res.json({ message: 'API tracking counters reset', stats: await getApiTrackingStats() });
  });
  
  // Get current API tracking stats
  router.get('/costs/stats', async (req, res) => {
    res.json({ stats: await getApiTrackingStats() });
  });
  
  // Get detailed monthly stats
  router.get('/costs/monthly', async (req, res) => {
    const monthlyStats = await getMonthlyStats();
    res.json({ 
      monthly: monthlyStats,
      currentMonth: monthlyStats.currentMonth,
      previousMonth: monthlyStats.previousMonth
    });
  });
  
  // Get detailed call history with timestamps
  router.get('/costs/history', async (req, res) => {
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
  
  router.get('/costs', async (req, res) => {
    console.log('[Costs] ===== API COSTS REQUEST START =====');
    console.log('[Costs] Request timestamp:', new Date().toISOString());
    
    try {
      console.log('[Costs] Fetching cost history for the last 6 months...');
      const monthlyStats = await getMonthlyStats(6);
      
      const lastSixMonthsCosts = monthlyStats.lastSixMonths.map(monthData => {
        const googleCost = (monthData.stats.googlePlacesSearch * 0.017) + (monthData.stats.googlePlacesDetails * 0.017);
        const apolloCost = monthData.stats.apolloContacts * (parseFloat(process.env.APOLLO_COST_PER_CREDIT) || 0.00895);
        return {
          month: monthData.month,
          totalCost: googleCost + apolloCost,
          googleCost,
          apolloCost,
          usage: monthData.stats
        };
      });

      const currentMonthData = lastSixMonthsCosts[lastSixMonthsCosts.length - 1] || { totalCost: 0, usage: {} };
      const previousMonthData = lastSixMonthsCosts[lastSixMonthsCosts.length - 2] || { totalCost: 0 };
      
      let trend = 'stable';
      if (currentMonthData.totalCost > previousMonthData.totalCost * 1.05) {
        trend = 'up';
      } else if (currentMonthData.totalCost < previousMonthData.totalCost * 0.95) {
        trend = 'down';
      }

      const costsData = {
        total: {
          currentMonth: currentMonthData.totalCost,
          previousMonth: previousMonthData.totalCost,
          trend: trend
        },
        history: lastSixMonthsCosts
      };
      
      console.log('[Costs] Final costs data:', JSON.stringify(costsData, null, 2));
      console.log('[Costs] ===== API COSTS REQUEST COMPLETE =====');
      
      res.json(costsData);
    } catch (error) {
      console.error('[Costs] Error fetching costs data:', error);
      console.log('[Costs] ===== API COSTS REQUEST FAILED =====');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get email activity statistics
router.get('/email-activities/stats', async (req, res) => {
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
router.get('/reports/:reportId/download', async (req, res) => {
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
router.get('/dashboard', async (req, res) => {
  try {
    const businesses = await Business.find({}).sort({ addedAt: -1 });
    res.json({ businesses });
  } catch (error) {
    console.error('[Dashboard] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear all data (for testing)
router.delete('/clear', async (req, res) => {
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

// Delete enrichment data for a single business
router.delete('/business/:placeId', async (req, res) => {
  const { placeId } = req.params;
  try {
    const business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Reset enrichment fields
    business.website = null;
    business.phone = '';
    business.emails = [];
    business.numLocations = null;
    business.locationNames = [];
    business.decisionMakers = [];
    business.enriched = undefined;
    business.apolloAttempted = false;
    business.lastUpdated = undefined;

    await business.save();

    res.json({ message: `Enrichment data for ${business.name} has been cleared.` });
  } catch (error) {
    console.error(`[Clear] Error clearing enrichment data for business ${placeId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Email Templates API endpoints
router.get('/email-templates', async (req, res) => {
  try {
    const templates = await EmailTemplate.find({}).sort({ createdAt: -1 });
    res.json(templates);
  } catch (error) {
    console.error('[EmailTemplates] Error fetching templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/email-templates', async (req, res) => {
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

router.put('/email-templates/:id', async (req, res) => {
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

router.delete('/email-templates/:id', async (req, res) => {
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

router.put('/email-templates/:id/default', async (req, res) => {
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

// Find the place-details endpoint
router.get('/place-details/:placeId', async (req, res) => {
  const { placeId } = req.params;
  const { enrich, testUrl, disablePuppeteer, apollo, debug } = req.query;
  
  try {
    const enrichedBusiness = await enrichBusinessData(placeId, { 
      enrich: enrich === 'true', 
      apollo: apollo === 'true', 
      testUrl, 
      disablePuppeteer: disablePuppeteer === 'true', 
      debug: debug === 'true' 
    });

    res.json({
      website: enrichedBusiness.website,
      formatted_phone_number: enrichedBusiness.phone,
      emails: enrichedBusiness.emails,
      numLocations: enrichedBusiness.numLocations,
      locationNames: enrichedBusiness.locationNames,
      decisionMakers: enrichedBusiness.decisionMakers,
      usedPuppeteer: false // This can be refined within the enrichment function
    });
  } catch (error) {
    console.error(`[PlaceDetails] Error enriching place details for placeId ${placeId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await Campaign.find({}).sort({ createdAt: -1 });
    res.json(campaigns);
  } catch (error) {
    console.error('[Campaigns] Error fetching campaigns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new campaign
router.post('/campaigns', async (req, res) => {
  try {
    const { name, description, businessIds, emailTemplateId } = req.body;
    
    // Fetch the business details
    const businesses = await Business.find({ id: { $in: businessIds } });
    
    const campaign = new Campaign({
      name,
      description,
      businesses: businesses.map(b => b._id),
      emailTemplate: emailTemplateId,
    });
    
    await campaign.save();
    res.json(campaign);
  } catch (error) {
    console.error('[Campaigns] Error creating campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single campaign with populated businesses
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).populate('businesses');
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json(campaign);
  } catch (error) {
    console.error('[Campaigns] Error fetching campaign:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;