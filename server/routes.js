import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

import {
  resetApiTracking,
  getApiTrackingStats,
  getMonthlyStats,
  getGooglePlacesCosts,
  getApolloCosts,
  fetchHtmlWithFallback,
  extractDomain,
  detectLocations,
  analyzeWebsiteForICP,
  normalizeAndDeduplicateEmails,
  findSimilarBusinesses,
  cloneEnrichmentData,
  scrapeLinktree,
  parseSitemap,
} from './utils.js';

import Business from './models/Business.js';
import Campaign from './models/Campaign.js';
import EmailTemplate from './models/EmailTemplate.js';
import EmailActivity from './models/EmailActivity.js';
import ApiCallLog from './models/ApiCallLog.js';
import ICPConfig from './models/ICPConfig.js';
import { calculateICPScore, getDefaultICPConfigs } from './icpScoring.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Extract country from address string
 */
function extractCountryFromAddress(address, website = null, phone = null) {
  // Check for city/region-specific patterns first (most reliable)
  if (address) {
    const addressLower = address.toLowerCase();
    
    // Argentina-specific patterns
    if (addressLower.includes('caba') || 
        addressLower.includes('cdad. autónoma') ||
        addressLower.includes('ciudad autónoma') ||
        addressLower.includes('buenos aires') ||
        addressLower.includes('c1107') || // Buenos Aires postal codes start with C
        addressLower.includes('cordoba') ||
        addressLower.includes('rosario') ||
        addressLower.includes('mendoza')) {
      return 'Argentina';
    }
    
    // Mexico-specific patterns
    if (addressLower.includes('cdmx') ||
        addressLower.includes('ciudad de méxico') ||
        addressLower.includes('guadalajara') ||
        addressLower.includes('monterrey')) {
      return 'Mexico';
    }
    
    // Brazil-specific patterns
    if (addressLower.includes('são paulo') ||
        addressLower.includes('rio de janeiro') ||
        addressLower.includes('brasília')) {
      return 'Brazil';
    }
    
    // USA-specific patterns
    if (addressLower.match(/\b[a-z]{2}\s+\d{5}\b/)) { // State abbreviation + ZIP code
      return 'United States';
    }
  }
  
  // Check website TLD
  if (website) {
    const tldMatch = website.match(/\.([a-z]{2,})$/i);
    if (tldMatch) {
      const tld = tldMatch[1].toLowerCase();
      const tldCountryMap = {
        'ar': 'Argentina',
        'mx': 'Mexico',
        'br': 'Brazil',
        'cl': 'Chile',
        'co': 'Colombia',
        'es': 'Spain',
        'fr': 'France',
        'it': 'Italy',
        'de': 'Germany',
        'uk': 'United Kingdom',
        'ca': 'Canada'
      };
      if (tldCountryMap[tld]) {
        return tldCountryMap[tld];
      }
    }
  }
  
  // Check phone number patterns
  if (phone) {
    const phoneClean = phone.replace(/\D/g, '');
    if (phoneClean.startsWith('54') || phone.startsWith('011')) { // Argentina
      return 'Argentina';
    }
    if (phoneClean.startsWith('52') || phone.startsWith('+52')) { // Mexico
      return 'Mexico';
    }
    if (phoneClean.startsWith('55') || phone.startsWith('+55')) { // Brazil
      return 'Brazil';
    }
    if (phoneClean.startsWith('1') && phoneClean.length === 11) { // US/Canada
      return 'United States';
    }
  }
  
  // Fallback to parsing address parts
  if (address) {
    const parts = address.split(',').map(p => p.trim());
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1].toLowerCase();
      
      // Check for country names
      const countryMap = {
        'argentina': 'Argentina',
        'united states': 'United States',
        'usa': 'United States',
        'us': 'United States',
        'mexico': 'Mexico',
        'méxico': 'Mexico',
        'brazil': 'Brazil',
        'brasil': 'Brazil',
        'chile': 'Chile',
        'colombia': 'Colombia',
        'spain': 'Spain',
        'españa': 'Spain',
        'france': 'France',
        'italy': 'Italy',
        'italia': 'Italy',
        'germany': 'Germany',
        'united kingdom': 'United Kingdom',
        'uk': 'United Kingdom',
        'canada': 'Canada'
      };
      
      for (const [key, value] of Object.entries(countryMap)) {
        if (lastPart.includes(key)) {
          return value;
        }
      }
      
      // Check for country codes (2-letter)
      if (lastPart.length === 2) {
        const countryCodeMap = {
          'ar': 'Argentina',
          'us': 'United States',
          'mx': 'Mexico',
          'br': 'Brazil',
          'cl': 'Chile',
          'co': 'Colombia',
          'es': 'Spain',
          'fr': 'France',
          'it': 'Italy',
          'de': 'Germany',
          'gb': 'United Kingdom',
          'uk': 'United Kingdom',
          'ca': 'Canada'
        };
        if (countryCodeMap[lastPart.toLowerCase()]) {
          return countryCodeMap[lastPart.toLowerCase()];
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract primary category from Google Places types
 */
function extractCategoryFromTypes(types) {
  if (!types || types.length === 0) return null;
  
  // Google Places returns types in order of specificity (most specific first)
  // Filter out very generic types that don't provide useful categorization
  const genericTypes = ['establishment', 'point_of_interest'];
  
  // Find the first type that's not in the generic list
  const specificType = types.find(type => !genericTypes.includes(type));
  
  if (specificType) {
    // Return the specific type, formatted nicely
    return specificType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  // Fallback to first type if all are generic (unlikely)
  return types[0]
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function enrichBusinessData(placeId, options = {}) {
  const { enrich = true, apollo = true, testUrl = '', disablePuppeteer = false, debug = false, force = false, progressCallback } = options;
  const noPuppeteer = disablePuppeteer;
  const debugMode = debug || process.env.DEBUG_SCRAPER === 'true';
  
  // Helper to send progress updates
  const sendProgress = (message) => {
    if (progressCallback && typeof progressCallback === 'function') {
      progressCallback(message);
    }
  };

  console.log(`[Enrichment] Starting for placeId: ${placeId}, force: ${force}`);
  sendProgress('Looking up business in database...');
  const existingBusiness = await Business.findOne({ placeId });
  
  if (existingBusiness) {
    sendProgress(`✓ Found: ${existingBusiness.name}`);
  }

  if (!existingBusiness) {
    // This can happen if a business is deleted but an action is still triggered from the UI
    console.log(`[Enrichment] Business with placeId ${placeId} not found in database. Aborting enrichment.`);
    throw new Error('Business not found');
  }
  
  console.log(`[Enrichment] Found business. enrichedAt: ${existingBusiness.enrichedAt}`);

  // If business was recently enriched and not forcing, return cached data
  if (existingBusiness.enrichedAt && enrich && !force) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (new Date(existingBusiness.enrichedAt) > thirtyDaysAgo) {
      console.log('[Enrichment] Business recently enriched. Returning cached data.');
      return existingBusiness;
    }
  }
  
  if (force) {
    console.log('[Enrichment] Force re-enrichment requested. Bypassing cache.');
  }

  const apolloApiKey = process.env.APOLLO_API_KEY;

  // No need to fetch from Google Places API again - we already have complete data from the initial search
  console.log('[Enrichment] Using existing business data (already fetched during search):', {
    name: existingBusiness.name,
    formatted_address: existingBusiness.address,
    website: existingBusiness.website,
    formatted_phone_number: existingBusiness.phone,
    primaryType: existingBusiness.primaryType,
    category: existingBusiness.category
  });

  let website = existingBusiness.website;
  if (testUrl) {
    website = testUrl;
  }
  
  let emails = [];
  let numLocations = 1; // Default to 1 location for any business
  let locationNames = [];
  let decisionMakers = [];
  let websiteAnalysis = {
    hasSEO: null,
    hasWhatsApp: null,
    hasReservation: null,
    hasDirectOrdering: null,
    hasThirdPartyDelivery: null,
    analyzedAt: null
  };

  // Check if website is a third-party delivery platform (skip scraping)
  const isThirdPartyPlatform = (url) => {
    const thirdPartyDomains = [
      'pedidosya.com',
      'rappi.com',
      'ubereats.com',
      'doordash.com',
      'grubhub.com',
      'deliveroo.com',
      'justeat.com',
      'seamless.com',
      'postmates.com',
      'foodpanda.com',
      'swiggy.com',
      'zomato.com',
      'ifood.com'
    ];
    return thirdPartyDomains.some(domain => url.toLowerCase().includes(domain));
  };

  // Check if the website is a Linktree URL and scrape it for the real website
  if (enrich && website && (website.includes('linktr.ee') || website.includes('linktree.com'))) {
    console.log(`[Enrichment] Detected Linktree URL: ${website}`);
    sendProgress(`Detected Linktree page, extracting real website...`);
    
    const { website: realWebsite, whatsapp: whatsappLink } = await scrapeLinktree(website);
    
    if (realWebsite) {
      console.log(`[Enrichment] Found real website from Linktree: ${realWebsite}`);
      website = realWebsite;
      sendProgress(`✓ Found real website: ${realWebsite}`);
    } else if (whatsappLink) {
      console.log(`[Enrichment] No website found, but found WhatsApp link: ${whatsappLink}`);
      sendProgress(`✓ Found WhatsApp link: ${whatsappLink}`);
    } else {
      console.log(`[Enrichment] Could not extract website from Linktree`);
      sendProgress(`Could not extract website from Linktree page`);
      website = null; // Clear website so we don't try to scrape Linktree itself
    }
    
    // Update the business with the found website/whatsapp
    if (realWebsite || whatsappLink) {
      const updateData = {};
      if (realWebsite) updateData.website = realWebsite;
      if (whatsappLink && !existingBusiness.websiteAnalysis?.hasWhatsApp) {
        updateData['websiteAnalysis.hasWhatsApp'] = true;
      }
      
      await Business.updateOne(
        { placeId },
        { $set: updateData }
      );
      
      console.log(`[Enrichment] Updated business with Linktree data:`, updateData);
    }
  }

  if (enrich && website && !isThirdPartyPlatform(website)) {
    // 1. Scrape homepage HTML using progressive strategy
    console.log(`[Enrichment] Fetching website: ${website}`);
    sendProgress(`Fetching website: ${website}`);
    const { html: homepageHtml, usedPuppeteer: homepageUsedPuppeteer } = await fetchHtmlWithFallback(website, { noPuppeteer, debugMode });
    sendProgress(`✓ Website loaded successfully (${homepageUsedPuppeteer ? 'using browser' : 'direct fetch'})`);

    // Analyze website for ICP variables
    console.log(`[Enrichment] Analyzing website for ICP variables`);
    sendProgress('Analyzing website for SEO, WhatsApp, ordering systems...');
    websiteAnalysis = analyzeWebsiteForICP(homepageHtml, website);
    
    // Report analysis results
    const features = [];
    if (websiteAnalysis.hasSEO) features.push('SEO');
    if (websiteAnalysis.hasWhatsApp) features.push('WhatsApp');
    if (websiteAnalysis.hasReservation) features.push('Reservations');
    if (websiteAnalysis.hasDirectOrdering) features.push('Direct Ordering');
    if (websiteAnalysis.hasThirdPartyDelivery) features.push('3rd Party Delivery');
    sendProgress(`✓ Analysis complete. Found: ${features.length > 0 ? features.join(', ') : 'No special features'}`);

    // Parse sitemap.xml to discover pages
    console.log(`[Enrichment] Parsing sitemap.xml`);
    sendProgress('Checking sitemap for additional pages...');
    const sitemapData = await parseSitemap(website);
    if (sitemapData.found) {
      const sitemapInfo = [];
      if (sitemapData.categorized.locations.length > 0) {
        sitemapInfo.push(`${sitemapData.categorized.locations.length} location page(s)`);
      }
      if (sitemapData.categorized.contact.length > 0) {
        sitemapInfo.push(`${sitemapData.categorized.contact.length} contact page(s)`);
      }
      if (sitemapData.categorized.menu.length > 0) {
        sitemapInfo.push(`${sitemapData.categorized.menu.length} menu page(s)`);
      }
      sendProgress(`✓ Sitemap found: ${sitemapData.urls.length} total URLs (${sitemapInfo.join(', ')})`);
      
      // Send detailed URLs as sub-messages
      if (sitemapData.categorized.locations.length > 0) {
        sendProgress(`  Locations (${sitemapData.categorized.locations.length}):`);
        sitemapData.categorized.locations.forEach(url => {
          sendProgress(`    ${url}`);
        });
      }
      if (sitemapData.categorized.contact.length > 0) {
        sendProgress(`  Contact (${sitemapData.categorized.contact.length}):`);
        sitemapData.categorized.contact.forEach(url => {
          sendProgress(`    ${url}`);
        });
      }
      if (sitemapData.categorized.about.length > 0) {
        sendProgress(`  About (${sitemapData.categorized.about.length}):`);
        sitemapData.categorized.about.forEach(url => {
          sendProgress(`    ${url}`);
        });
      }
      if (sitemapData.categorized.menu.length > 0) {
        sendProgress(`  Menu (${sitemapData.categorized.menu.length}):`);
        sitemapData.categorized.menu.forEach(url => {
          sendProgress(`    ${url}`);
        });
      }
      if (sitemapData.categorized.other.length > 0) {
        sendProgress(`  Other (${sitemapData.categorized.other.length}):`);
        sitemapData.categorized.other.forEach(url => {
          sendProgress(`    ${url}`);
        });
      }
    } else {
      sendProgress('  No sitemap found');
    }

    // Detect locations from the homepage HTML
    console.log(`[Enrichment] Detecting locations from homepage HTML`);
    sendProgress('Scanning for business locations...');
    const { 
      numLocations: detectedNumLocations, 
      locationNames: detectedLocationNames, 
      usedPuppeteer: detectLocationsUsedPuppeteer 
    } = await detectLocations(homepageHtml, website, { noPuppeteer, debugMode, sitemapData });
    
    // Use detected locations if available, otherwise keep default of 1
    if (detectedNumLocations && detectedNumLocations > 0) {
      numLocations = detectedNumLocations;
    }
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
      sendProgress(`✓ Found ${numLocations} location(s) on website`);
      
      // Show individual location names as sub-messages
      if (locationNames.length > 0) {
        locationNames.forEach((location, index) => {
          sendProgress(`  ${index + 1}. ${location}`);
        });
      }
    } else {
      console.log('[Enrichment] No distinct locations detected on homepage.');
      sendProgress('✓ No additional locations found on website');
    }
    
    // If we couldn't find locations from website (no website or scraping failed),
    // search Google Places API for other locations with the same business name
    if (numLocations === 1 && existingBusiness) {
      try {
        console.log(`[Enrichment] Searching Google Places for other "${existingBusiness.name}" locations...`);
        sendProgress('Searching Google Places for additional locations...');
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        
        // Get the country/region from the existing business address
        const country = existingBusiness.country || 'Argentina';
        const searchQuery = `${existingBusiness.name} ${country}`;
        
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        
        if (searchData.status === 'OK' && searchData.results && searchData.results.length > 0) {
          // Filter results to match the business name closely
          const matchingLocations = searchData.results.filter(place => {
            const placeName = place.name.toLowerCase();
            const businessName = existingBusiness.name.toLowerCase();
            // Check if names are similar (allows for slight variations)
            return placeName.includes(businessName) || businessName.includes(placeName);
          });
          
          if (matchingLocations.length > 1) {
            console.log(`[Enrichment] Found ${matchingLocations.length} locations via Google Places API`);
            
            // Extract location names from addresses
            const apiLocationNames = matchingLocations.map(place => {
              // Extract city/neighborhood from formatted_address
              const address = place.formatted_address || place.vicinity || '';
              const parts = address.split(',');
              return parts[0]?.trim() || address;
            }).filter(name => name);
            
            numLocations = matchingLocations.length;
            locationNames = apiLocationNames;
            
            console.log(`[Enrichment] ✅ Updated locations from Google Places API:`, {
              numLocations,
              locationNames
            });
            sendProgress(`✓ Found ${numLocations} total locations via Google Places`);
            
            // Show individual location names as sub-messages
            if (apiLocationNames.length > 0) {
              apiLocationNames.forEach((location, index) => {
                sendProgress(`  ${index + 1}. ${location}`);
              });
            }
          } else {
            sendProgress('✓ No additional locations found via Google Places');
          }
        } else {
          sendProgress('✓ No additional locations found via Google Places');
        }
      } catch (error) {
        console.log(`[Enrichment] Error searching Google Places for locations:`, error.message);
        sendProgress('✓ Google Places search completed');
      }
    }

    // 2. Extract emails
    sendProgress('Extracting contact emails from website...');
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
    let contactPages = [];
    
    // First, try to use sitemap contact pages if available
    if (sitemapData && sitemapData.found) {
      contactPages = [
        ...sitemapData.categorized.contact,
        ...sitemapData.categorized.about
      ];
      if (contactPages.length > 0) {
        console.log(`[Enrichment] Using ${contactPages.length} contact/about page(s) from sitemap`);
      }
    }
    
    // If no sitemap contact pages, fallback to manual detection
    if (contactPages.length === 0) {
      contactPages = findContactPages(homepageHtml);
    }
    
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
    sendProgress(`✓ Found ${emails.length} email(s)`);
  } else if (enrich && website && isThirdPartyPlatform(website)) {
    // Website is a third-party delivery platform - skip scraping
    console.log(`[Enrichment] Website is a third-party delivery platform (${website}). Skipping scraping.`);
    sendProgress('✓ Detected third-party delivery platform - skipping website scraping');
    
    // Mark as having third-party delivery
    websiteAnalysis.hasThirdPartyDelivery = true;
    websiteAnalysis.analyzedAt = new Date();
    
    // Don't try to scrape for locations or emails from delivery platforms
    console.log('[Enrichment] Skipping location and email detection for third-party platform.');
    sendProgress('✓ Analysis complete. Found: 3rd Party Delivery');
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
      try {
        await ApiCallLog.create({
          api: 'apollo_organization_enrich',
          timestamp: new Date(),
          details: {
            endpoint: 'organizations/enrich',
            domain: domain,
            businessName: businessName,
          }
        });
      } catch (error) {
        console.error('[Tracking] Error saving Apollo Organization Enrich API call to database:', error);
      }
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
              // Extract city and state, ensuring proper "City, State" format
              const city = addressParts[addressParts.length - 2].trim();
              const statePart = addressParts[addressParts.length - 1].trim();
              // Extract state (first part before any additional info like ZIP)
              const state = statePart.split(' ')[0];
              
              // Ensure we have valid city and state
              if (city && state && city.length > 0 && state.length > 0) {
                  peopleBody['person_locations'] = [`${city}, ${state}`];
                  console.log(`[Enrichment] Added location filter to Apollo search: ${city}, ${state}`);
              } else {
                  console.log(`[Enrichment] Could not parse valid city/state from address: ${existingBusiness.address}`);
              }
          } else {
              console.log(`[Enrichment] Address format not suitable for location filtering: ${existingBusiness.address}`);
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
        try {
          await ApiCallLog.create({
            api: 'apollo_people_search',
            timestamp: new Date(),
            details: {
              endpoint: 'people/search',
              businessName: existingBusiness.name,
              placeId: existingBusiness.placeId,
              foundContactsCount: peopleData.people?.length || 0
            }
          });
        } catch (error) {
          console.error('[Tracking] Error saving Apollo People Search API call to database:', error);
        }
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

    // Always update basic fields and set enrichedAt timestamp when enrichment is performed
    existingBusiness.website = website;
    existingBusiness.emails = emails;
    existingBusiness.numLocations = numLocations;
    existingBusiness.locationNames = locationNames;
    existingBusiness.decisionMakers = decisionMakers;
    existingBusiness.websiteAnalysis = websiteAnalysis;
    
    // Update category from primaryType or types if we have better information
    console.log(`[Enrichment] Current category: "${existingBusiness.category}", primaryType: ${existingBusiness.primaryType || 'N/A'}, types: [${existingBusiness.types?.join(', ')}]`);
    
    let updatedCategory = null;
    
    // Prefer primaryType from new Places API if available
    if (existingBusiness.primaryType) {
      updatedCategory = existingBusiness.primaryType
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      console.log(`[Enrichment] Using primaryType: ${existingBusiness.primaryType} → ${updatedCategory}`);
    } else if (existingBusiness.types && existingBusiness.types.length > 0) {
      updatedCategory = extractCategoryFromTypes(existingBusiness.types);
      console.log(`[Enrichment] Using extracted category from types: ${updatedCategory}`);
    }
    
    if (updatedCategory && updatedCategory !== existingBusiness.category) {
      const oldCategory = existingBusiness.category;
      existingBusiness.category = updatedCategory;
      console.log(`[Enrichment] ✅ Updated category from "${oldCategory}" to: ${updatedCategory}`);
    } else {
      console.log(`[Enrichment] Category unchanged: ${existingBusiness.category}`);
    }
    
    // Update country if we now have more information (website, phone)
    console.log(`[Enrichment] Current country: ${existingBusiness.country}, checking if update needed...`);
    if (!existingBusiness.country || existingBusiness.country === 'United States') {
      console.log(`[Enrichment] Attempting country detection with address: "${existingBusiness.address}", website: "${website}", phone: "${existingBusiness.phone}"`);
      const updatedCountry = extractCountryFromAddress(existingBusiness.address, website, existingBusiness.phone);
      console.log(`[Enrichment] Detected country: ${updatedCountry}`);
      if (updatedCountry) {
        const oldCountry = existingBusiness.country;
        existingBusiness.country = updatedCountry;
        console.log(`[Enrichment] ✅ Updated country from "${oldCountry}" to: ${updatedCountry}`);
      }
    }
    
    // Always set enrichedAt timestamp when enrichment is performed
    existingBusiness.enrichedAt = new Date();
    await existingBusiness.save();
    
    console.log('[Enrichment] Saved enriched data to database:', {
      businessId: existingBusiness.id,
      businessName: existingBusiness.name,
      category: existingBusiness.category,
      website: existingBusiness.website,
      phone: existingBusiness.phone,
      country: existingBusiness.country,
      emailsCount: existingBusiness.emails.length,
      numLocations: existingBusiness.numLocations,
      locationNamesCount: existingBusiness.locationNames.length,
      decisionMakersCount: decisionMakers.length,
      websiteAnalysis: existingBusiness.websiteAnalysis,
      enrichedAt: existingBusiness.enrichedAt,
      hasNewContacts: hasNewContacts,
      hasNewLocationInfo: hasNewLocationInfo
    });
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


router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

// Get Google API key for frontend (Places autocomplete)
router.get('/google-api-key', (req, res) => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (apiKey) {
    res.json({ apiKey });
  } else {
    res.status(500).json({ error: 'API key not configured' });
  }
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

    // Try new Google Places API (v1) first for better category data (primaryType)
    console.log('[Search] Trying new Places API (v1)...');
    const newApiUrl = 'https://places.googleapis.com/v1/places:searchNearby';
    const newApiHeaders = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.types,places.primaryType,places.rating,places.userRatingCount'
    };
    
    let placesData = null;
    let usedNewAPI = false;
    
    try {
      const newApiBody = {
        includedTypes: ['restaurant', 'food', 'cafe', 'store', 'establishment'],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: {
              latitude: lat,
              longitude: lng
            },
            radius: 5000.0
          }
        }
      };
      
      // If keyword is provided, use searchText instead
      if (keyword) {
        const searchTextUrl = 'https://places.googleapis.com/v1/places:searchText';
        const searchTextBody = {
          textQuery: keyword,
          maxResultCount: 20,
          locationBias: {
            circle: {
              center: {
                latitude: lat,
                longitude: lng
              },
              radius: 5000.0
            }
          }
        };
        
        const searchTextRes = await fetch(searchTextUrl, {
          method: 'POST',
          headers: newApiHeaders,
          body: JSON.stringify(searchTextBody)
        });
        
        if (searchTextRes.ok) {
          const searchTextData = await searchTextRes.json();
          placesData = {
            results: (searchTextData.places || []).map(place => ({
              place_id: place.id?.replace('places/', ''),
              name: place.displayName?.text || place.displayName,
              formatted_address: place.formattedAddress,
              website: place.websiteUri || null,
              formatted_phone_number: place.nationalPhoneNumber || '',
              types: place.types || [],
              primaryType: place.primaryType,
              rating: place.rating,
              user_ratings_total: place.userRatingCount,
              vicinity: place.formattedAddress
            }))
          };
          usedNewAPI = true;
          console.log('[Search] ✅ Using NEW Places API (searchText) with primaryType support');
        }
      } else {
        // Use searchNearby when no keyword
        const newApiRes = await fetch(newApiUrl, {
          method: 'POST',
          headers: newApiHeaders,
          body: JSON.stringify(newApiBody)
        });
        
        if (newApiRes.ok) {
          const newApiData = await newApiRes.json();
          placesData = {
            results: (newApiData.places || []).map(place => ({
              place_id: place.id?.replace('places/', ''),
              name: place.displayName?.text || place.displayName,
              formatted_address: place.formattedAddress,
              website: place.websiteUri || null,
              formatted_phone_number: place.nationalPhoneNumber || '',
              types: place.types || [],
              primaryType: place.primaryType,
              rating: place.rating,
              user_ratings_total: place.userRatingCount,
              vicinity: place.formattedAddress
            }))
          };
          usedNewAPI = true;
          console.log('[Search] ✅ Using NEW Places API (searchNearby) with primaryType support');
        }
      }
    } catch (newApiError) {
      console.log('[Search] New API failed, falling back to legacy API:', newApiError.message);
    }
    
    // Fallback to legacy API if new API failed
    if (!placesData) {
      console.log('[Search] Falling back to legacy API...');
      const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&keyword=${encodeURIComponent(keyword || '')}&key=${apiKey}`;
      console.log('[Search] Places search request URL:', placesUrl.replace(apiKey, 'API_KEY_HIDDEN'));
      
      const placesRes = await fetch(placesUrl);
      placesData = await placesRes.json();
      console.log('[Search] Places search response status:', placesRes.status);
    }
    
    console.log('[Search] Found places:', placesData.results?.length || 0);
    
    // Track Google Places Search API call in the database
    try {
      await ApiCallLog.create({
        api: 'google_places_search',
        timestamp: new Date(),
        details: {
          endpoint: usedNewAPI ? 'places:searchText' : 'nearbysearch',
          keyword: keyword,
          location: location,
          usedNewAPI: usedNewAPI
        }
      });
      console.log('[Tracking] Google Places Search API call tracked in database.');
    } catch (error) {
      console.error('[Tracking] Error saving Google Places Search API call to database:', error);
    }

    // Map Google results to business format without additional API calls
    const businessesFound = (placesData.results || []).map(place => {
      const address = place.vicinity || place.formatted_address || '';
      
      // Prefer primaryType from new API, fallback to extractCategoryFromTypes
      let extractedCategory = null;
      if (place.primaryType) {
        extractedCategory = place.primaryType
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        console.log(`[Search] Business: ${place.name}, PrimaryType: ${place.primaryType}, Category: ${extractedCategory}`);
      } else {
        extractedCategory = extractCategoryFromTypes(place.types);
        console.log(`[Search] Business: ${place.name}, Types: [${place.types?.join(', ')}], Extracted Category: ${extractedCategory}`);
      }
      
      const business = {
        id: place.place_id,
        name: place.name,
        address: address,
        website: place.website || null, // From new Places API or legacy API
        placeId: place.place_id,
        phone: place.formatted_phone_number || '', // From new Places API or legacy API
        emails: [],
        auditReport: null,
        emailStatus: 'pending',
        addedAt: new Date().toISOString(),
        types: place.types || [],
        primaryType: place.primaryType || null, // Store primaryType for future use
        category: extractedCategory,
        rating: place.rating || null,
        userRatingsTotal: place.user_ratings_total || null,
        country: extractCountryFromAddress(address, place.website, place.formatted_phone_number),
        numLocations: 1, // Default to 1, will be updated during enrichment
        locationNames: [],
        websiteAnalysis: {
          hasSEO: null,
          hasWhatsApp: null,
          hasReservation: null,
          hasDirectOrdering: null,
          hasThirdPartyDelivery: null,
          analyzedAt: null
        }
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

// Search business by Place ID (for "Look by name" feature)
router.post('/search-by-place-id', async (req, res) => {
  const { placeId, includeApollo = true } = req.body;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  console.log('[Search by Place ID] Request received:', { placeId });

  if (!apiKey) {
    console.log('[Search by Place ID] No Google Places API key found');
    return res.status(500).json({ 
      error: 'Google Places API key not configured',
      message: 'The Google Places API key is missing. Please add it to the server configuration to enable search.' 
    });
  }

  if (!placeId) {
    return res.status(400).json({ 
      error: 'Place ID is required',
      message: 'Please provide a valid place ID.' 
    });
  }

  try {
    // Try new Google Places API (v1) first for better category data
    console.log('[Search by Place ID] Trying new Places API (v1)...');
    const newApiUrl = `https://places.googleapis.com/v1/places/${placeId}`;
    const newApiHeaders = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,websiteUri,nationalPhoneNumber,types,primaryType,rating,userRatingCount,businessStatus,googleMapsUri'
    };
    
    let place = null;
    let usedNewAPI = false;
    
    try {
      const newApiRes = await fetch(newApiUrl, { headers: newApiHeaders });
      if (newApiRes.ok) {
        const newApiData = await newApiRes.json();
        console.log('[Search by Place ID] New API Response:', JSON.stringify(newApiData, null, 2));
        
        // Map new API response to legacy format
        place = {
          place_id: newApiData.id?.replace('places/', ''),
          name: newApiData.displayName?.text || newApiData.displayName,
          formatted_address: newApiData.formattedAddress,
          website: newApiData.websiteUri,
          formatted_phone_number: newApiData.nationalPhoneNumber,
          types: newApiData.types || [],
          primaryType: newApiData.primaryType, // NEW: Primary category field
          rating: newApiData.rating,
          user_ratings_total: newApiData.userRatingCount,
          business_status: newApiData.businessStatus,
          url: newApiData.googleMapsUri
        };
        usedNewAPI = true;
        console.log('[Search by Place ID] ✅ Using NEW Places API with primaryType:', newApiData.primaryType);
      }
    } catch (newApiError) {
      console.log('[Search by Place ID] New API failed, falling back to legacy API:', newApiError.message);
    }
    
    // Fallback to legacy API if new API failed
    if (!place) {
      console.log('[Search by Place ID] Fetching from legacy API...');
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=place_id,name,formatted_address,website,formatted_phone_number,types,rating,user_ratings_total,business_status,url,editorial_summary&key=${apiKey}`;
      
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();
      
      console.log('[Search by Place ID] Legacy API Response:', JSON.stringify(detailsData, null, 2));
      
      if (detailsData.status !== 'OK' || !detailsData.result) {
        console.log('[Search by Place ID] Place not found:', detailsData.status);
        return res.status(404).json({ 
          error: 'Place not found',
          message: 'The selected business could not be found. It may no longer exist or may have been removed.'
        });
      }
      
      place = detailsData.result;
    }
    
    if (!place) {
      return res.status(404).json({ 
        error: 'Place not found',
        message: 'The selected business could not be found.'
      });
    }
    console.log('[Search by Place ID] Found place:', place.name);

    // Track Google Places Details API call
    try {
      await ApiCallLog.create({
        api: 'google_places_details',
        timestamp: new Date(),
        details: {
          endpoint: 'details',
          placeId: placeId,
          businessName: place.name
        }
      });
      console.log('[Tracking] Google Places Details API call tracked in database.');
    } catch (error) {
      console.error('[Tracking] Error saving Google Places Details API call to database:', error);
    }

    // Create business object
    const address = place.formatted_address || '';
    
    // Use primaryType from new API if available, otherwise extract from types
    let extractedCategory;
    if (place.primaryType) {
      extractedCategory = place.primaryType
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      console.log(`[Search by Place ID] ✅ Using primaryType: ${place.primaryType} → ${extractedCategory}`);
    } else {
      extractedCategory = extractCategoryFromTypes(place.types);
      console.log(`[Search by Place ID] Using extracted category from types: ${extractedCategory}`);
    }
    
    console.log(`[Search by Place ID] Business: ${place.name}, Types: [${place.types?.join(', ')}], Primary Type: ${place.primaryType || 'N/A'}, Extracted Category: ${extractedCategory}`);
    const business = {
      id: place.place_id,
      name: place.name,
      address: address,
      website: place.website || null,
      placeId: place.place_id,
      phone: place.formatted_phone_number || '',
      emails: [],
      auditReport: null,
      emailStatus: 'pending',
      addedAt: new Date().toISOString(),
      types: place.types || [],
      primaryType: place.primaryType || null, // Store primaryType from new API
      category: extractedCategory,
      rating: place.rating || null,
      userRatingsTotal: place.user_ratings_total || null,
      country: extractCountryFromAddress(address, place.website, place.formatted_phone_number),
      numLocations: 1, // Default to 1, will be updated during enrichment
      locationNames: [],
      websiteAnalysis: {
        hasSEO: null,
        hasWhatsApp: null,
        hasReservation: null,
        hasDirectOrdering: null,
        hasThirdPartyDelivery: null,
        analyzedAt: null
      }
    };

    // Save to database or fetch existing business
    let businessToReturn = business;
    try {
      const existingBusiness = await Business.findOne({ placeId: business.placeId });
      if (!existingBusiness) {
        await Business.create(business);
        console.log('[Search by Place ID] Business saved to database');
      } else {
        console.log('[Search by Place ID] Business already exists in database');
        // Return the existing business with all enriched data
        businessToReturn = {
          id: existingBusiness.placeId,
          name: existingBusiness.name,
          address: existingBusiness.address,
          website: existingBusiness.website,
          placeId: existingBusiness.placeId,
          phone: existingBusiness.phone,
          emails: existingBusiness.emails || [],
          auditReport: existingBusiness.auditReport || null,
          emailStatus: existingBusiness.emailStatus || 'pending',
          addedAt: existingBusiness.addedAt || new Date().toISOString(),
          types: existingBusiness.types || [],
          category: existingBusiness.category,
          rating: existingBusiness.rating,
          userRatingsTotal: existingBusiness.userRatingsTotal,
          country: existingBusiness.country,
          numLocations: existingBusiness.numLocations || 1,
          locationNames: existingBusiness.locationNames || [],
          websiteAnalysis: existingBusiness.websiteAnalysis || {
            hasSEO: null,
            hasWhatsApp: null,
            hasReservation: null,
            hasDirectOrdering: null,
            hasThirdPartyDelivery: null,
            analyzedAt: null
          },
          enrichedAt: existingBusiness.enrichedAt || null,
          icpScores: existingBusiness.icpScores || {}
        };
      }
    } catch (error) {
      console.error('[Search by Place ID] Error saving business to MongoDB:', error);
    }

    // Return as array to match the format of regular search
    res.json({ businesses: [businessToReturn] });
  } catch (error) {
    console.log('[Search by Place ID] Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to find business',
      message: 'An unexpected error occurred while trying to find the business. Please try again later.'
    });
  }
});

// Business enrichment endpoint - called by the business enrichment button
// SSE endpoint for enrichment progress (GET request required for EventSource)
router.get('/business/enrich-stream/:placeId', async (req, res) => {
  const { placeId } = req.params;
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  
  let currentStep = 0;
  const totalSteps = 6;
  
  const sendProgress = (message, incrementStep = false) => {
    if (incrementStep) {
      currentStep++;
      res.write(`data: ${JSON.stringify({ message, step: currentStep })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ message })}\n\n`);
    }
  };
  
  // Step-aware progress callback wrapper
  const progressCallback = (msg) => {
    // Detect key milestones and increment steps
    if (msg.includes('Looking up business')) {
      sendProgress(msg, true); // Step 1: Database lookup
    } else if (msg.includes('Fetching website:') || msg.includes('third-party delivery platform')) {
      sendProgress(msg, true); // Step 2: Website fetch
    } else if (msg.includes('Analyzing website') || msg.includes('Scanning for business locations')) {
      sendProgress(msg, true); // Step 3: Website analysis
    } else if (msg.includes('Searching Google Places') || msg.includes('Extracting contact emails')) {
      sendProgress(msg, true); // Step 4: Data extraction
    } else {
      sendProgress(msg, false);
    }
  };
  
  try {
    sendProgress('Starting enrichment...');
    
    // Call the enrichment method with progress callback
    const enrichedBusiness = await enrichBusinessData(placeId, { 
      enrich: true, 
      apollo: false,
      force: true,
      progressCallback
    });
    
    sendProgress('✓ Enrichment completed!', true); // Step 5
    
    // Send detailed summary
    sendProgress(`  Total locations: ${enrichedBusiness.numLocations || 1}`);
    sendProgress(`  Emails found: ${(enrichedBusiness.emails || []).length}`);
    
    // List website features
    const summaryFeatures = [];
    if (enrichedBusiness.websiteAnalysis) {
      if (enrichedBusiness.websiteAnalysis.hasSEO) summaryFeatures.push('SEO');
      if (enrichedBusiness.websiteAnalysis.hasWhatsApp) summaryFeatures.push('WhatsApp');
      if (enrichedBusiness.websiteAnalysis.hasReservation) summaryFeatures.push('Reservations');
      if (enrichedBusiness.websiteAnalysis.hasDirectOrdering) summaryFeatures.push('Direct Ordering');
      if (enrichedBusiness.websiteAnalysis.hasThirdPartyDelivery) summaryFeatures.push('3rd Party Delivery');
    }
    if (summaryFeatures.length > 0) {
      sendProgress(`  Features: ${summaryFeatures.join(', ')}`);
    } else {
      sendProgress(`  Features: None detected`);
    }
    
    // Find similar businesses
    sendProgress('Searching for similar businesses...', true); // Step 6
    const allBusinesses = await Business.find({});
    const { exactMatches, fuzzyMatches } = findSimilarBusinesses(enrichedBusiness, allBusinesses, {
      minSimilarity: 0.8,
      sameCountryOnly: true
    });
    
    if (exactMatches.length > 0) {
      sendProgress(`✓ Found ${exactMatches.length} similar business(es) - auto-cloning enrichment data...`);
      
      // Auto-clone for exact prefix matches
      for (const match of exactMatches) {
        try {
          const clonedData = cloneEnrichmentData(enrichedBusiness, match.business);
          await Business.updateOne(
            { placeId: match.business.placeId },
            { $set: clonedData }
          );
          sendProgress(`  Cloned to: ${match.business.name}`);
        } catch (cloneError) {
          console.error(`[Business Enrich] Error cloning to ${match.business.name}:`, cloneError);
        }
      }
    } else {
      sendProgress('✓ No similar businesses found for cloning');
    }
    
    // Send fuzzy matches if any
    if (fuzzyMatches && fuzzyMatches.length > 0) {
      res.write(`data: ${JSON.stringify({ 
        fuzzyMatches: fuzzyMatches.map(m => ({
          placeId: m.business.placeId,
          name: m.business.name,
          address: m.business.formatted_address,
          similarity: Math.round(m.similarity * 100),
          matchType: 'fuzzy'
        }))
      })}\n\n`);
    }
    
    sendProgress('✓ All done!', false);
    // Send final step completion
    res.write(`data: ${JSON.stringify({ step: totalSteps })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    sendProgress(`✗ Error: ${error.message}`, false);
    res.write(`data: ${JSON.stringify({ done: true, error: true })}\n\n`);
    res.end();
  }
});

router.post('/business/enrich/:placeId', async (req, res) => {
  const { placeId } = req.params;
  
  // Regular non-streaming POST request
  try {
    console.log(`[Business Enrich] Starting enrichment for placeId: ${placeId}`);
    
    // Call the enrichment method with apollo disabled and force re-enrichment
    const enrichedBusiness = await enrichBusinessData(placeId, { 
      enrich: true, 
      apollo: false,
      force: true  // Always force re-enrichment when user clicks the button
    });
    
    // The enrichBusinessData function already updates enrichedAt timestamp
    console.log(`[Business Enrich] Enrichment completed for placeId: ${placeId}`);
    
    // Find similar businesses for potential enrichment cloning
    console.log(`[Business Enrich] Searching for similar businesses to clone enrichment...`);
    const allBusinesses = await Business.find({});
    const { exactMatches, fuzzyMatches } = findSimilarBusinesses(enrichedBusiness, allBusinesses, {
      minSimilarity: 0.8,
      sameCountryOnly: true
    });
    
    console.log(`[Business Enrich] Found ${exactMatches.length} exact prefix matches and ${fuzzyMatches.length} fuzzy matches`);
    
    // Auto-clone for exact prefix matches
    const clonedBusinesses = [];
    for (const match of exactMatches) {
      try {
        const clonedData = cloneEnrichmentData(enrichedBusiness, match.business);
        await Business.updateOne(
          { placeId: match.business.placeId },
          { $set: clonedData }
        );
        clonedBusinesses.push({
          placeId: match.business.placeId,
          name: match.business.name,
          matchType: 'exact_prefix'
        });
        console.log(`[Business Enrich] Auto-cloned to: ${match.business.name}`);
      } catch (cloneError) {
        console.error(`[Business Enrich] Error cloning to ${match.business.name}:`, cloneError);
      }
    }
    
    // Return enriched business data (ICP calculation is done separately via the calculate ICP action)
    console.log(`[Business Enrich] Enrichment completed successfully for ${enrichedBusiness.name}`);
    res.json({
      success: true,
      message: 'Business enriched successfully',
      business: {
        id: enrichedBusiness.id,
        name: enrichedBusiness.name,
        website: enrichedBusiness.website,
        emails: enrichedBusiness.emails,
        numLocations: enrichedBusiness.numLocations,
        locationNames: enrichedBusiness.locationNames,
        enrichedAt: enrichedBusiness.enrichedAt
      },
      clonedBusinesses: clonedBusinesses,
      fuzzyMatches: fuzzyMatches.map(m => ({
        placeId: m.business.placeId,
        name: m.business.name,
        address: m.business.formatted_address,
        similarity: Math.round(m.similarity * 100),
        matchType: 'fuzzy'
      }))
    });
  } catch (error) {
    console.error(`[Business Enrich] Error for placeId ${placeId}:`, error);
    res.status(500).json({ 
      error: 'Failed to enrich business',
      message: error.message 
    });
  }
});

// Manual enrichment cloning endpoint - for fuzzy matches that need user confirmation
router.post('/business/clone-enrichment', async (req, res) => {
  const { sourcePlaceId, targetPlaceIds } = req.body;
  
  try {
    console.log(`[Enrichment Clone] Manual clone requested from ${sourcePlaceId} to ${targetPlaceIds.length} businesses`);
    
    // Get source business
    const sourceBusiness = await Business.findOne({ placeId: sourcePlaceId });
    if (!sourceBusiness) {
      return res.status(404).json({ error: 'Source business not found' });
    }
    
    if (!sourceBusiness.enrichedAt) {
      return res.status(400).json({ error: 'Source business is not enriched' });
    }
    
    const clonedBusinesses = [];
    const errors = [];
    
    // Clone to each target business
    for (const targetPlaceId of targetPlaceIds) {
      try {
        const targetBusiness = await Business.findOne({ placeId: targetPlaceId });
        if (!targetBusiness) {
          errors.push({ placeId: targetPlaceId, error: 'Business not found' });
          continue;
        }
        
        const clonedData = cloneEnrichmentData(sourceBusiness, targetBusiness);
        await Business.updateOne(
          { placeId: targetPlaceId },
          { $set: clonedData }
        );
        
        clonedBusinesses.push({
          placeId: targetBusiness.placeId,
          name: targetBusiness.name
        });
        
        console.log(`[Enrichment Clone] Successfully cloned to: ${targetBusiness.name}`);
      } catch (cloneError) {
        console.error(`[Enrichment Clone] Error cloning to ${targetPlaceId}:`, cloneError);
        errors.push({ placeId: targetPlaceId, error: cloneError.message });
      }
    }
    
    res.json({
      success: true,
      message: `Successfully cloned enrichment to ${clonedBusinesses.length} business(es)`,
      clonedBusinesses,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error(`[Enrichment Clone] Error:`, error);
    res.status(500).json({ 
      error: 'Failed to clone enrichment',
      message: error.message 
    });
  }
});

// Apollo-only enrichment for finding contacts
router.post('/apollo/enrich/:placeId', async (req, res) => {
  const { placeId } = req.params;
  const apolloApiKey = process.env.APOLLO_API_KEY;

  try {
    let business = await Business.findOne({ placeId });
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    console.log(`[Apollo Enrich] Starting Apollo enrichment for "${business.name}" (placeId: ${placeId})`);
    console.log(`[Apollo Enrich] Business enrichedAt:`, business.enrichedAt);
    console.log(`[Apollo Enrich] Business enrichedAt type:`, typeof business.enrichedAt);
    console.log(`[Apollo Enrich] Business enrichedAt instanceof Date:`, business.enrichedAt instanceof Date);
    
    // Step 1: Check if business is already enriched
    if (!business.enrichedAt) {
      console.log(`[Apollo Enrich] Business "${business.name}" is not enriched. Running enrichment first...`);
      try {
        // Call the enrichment method to get website and other data
        await enrichBusinessData(placeId, { enrich: true, apollo: false });
        
        // Refresh business data after enrichment
        const refreshedBusiness = await Business.findOne({ placeId });
        if (refreshedBusiness) {
          business = refreshedBusiness;
        }
        console.log(`[Apollo Enrich] Enrichment completed for "${business.name}". Website: ${business.website}`);
      } catch (enrichError) {
        console.error(`[Apollo Enrich] Error during enrichment:`, enrichError);
        return res.status(500).json({ 
          error: 'Failed to enrich business before Apollo search',
          message: enrichError.message 
        });
      }
    } else {
      console.log(`[Apollo Enrich] Business "${business.name}" is already enriched. Proceeding with Apollo search.`);
    }
    
    // Step 2: Call Apollo organization endpoint
    const businessName = business.name;
    const domain = business.website ? extractDomain(business.website) : null;
    console.log('[Apollo Enrich] Using website from enriched business data:', { 
      website: business.website, 
      domain: domain,
      businessName: businessName 
    });
    let orgId = undefined;

    if (domain) {
      console.log('[Apollo Enrich] Calling Apollo organization enrich API using website domain:', { 
        domain: domain, 
        name: businessName,
        website: business.website 
      });
      const enrichRes = await fetch('https://api.apollo.io/v1/organizations/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': apolloApiKey },
        body: JSON.stringify({
          api_key: apolloApiKey,
          domain: domain,
          name: businessName,
        }),
      });
      
      console.log('[Apollo Enrich] Apollo Organization Enrich API response status:', enrichRes.status);
      const enrichData = await enrichRes.json();
      
      if (!enrichRes.ok) {
        console.error('[Apollo Enrich] Apollo Organization Enrich API error:', enrichRes.status, enrichData);
      }
      try {
        await ApiCallLog.create({
          api: 'apollo_organization_enrich',
          timestamp: new Date(),
          details: {
            endpoint: 'organizations/enrich',
            domain: domain,
            businessName: businessName,
          }
        });
      } catch (error) {
        console.error('[Tracking] Error saving Apollo Organization Enrich API call to database:', error);
      }
      console.log('[Apollo Enrich] Apollo Organization Enrich API response:', JSON.stringify(enrichData, null, 2));
      if (enrichData.organization) {
        orgId = enrichData.organization.id;
      }
    } else {
      console.log('[Apollo Enrich] Skipping Apollo organization enrichment: no domain available.');
    }

    // Step 3: Call Apollo people endpoint
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
      console.log(`[Apollo Enrich] Falling back to Apollo search by organization name: "${businessName}"`);
      peopleBody['q_organization_names'] = [businessName];
    }

    // Add location filtering only if we don't have a specific organization ID
    if (!orgId && business.address) {
      let addressParts = business.address.split(', ');
      
      let country = null;
      if (addressParts.length > 1 && /USA|United States/i.test(addressParts[addressParts.length - 1])) {
          country = addressParts.pop().trim();
      }

      if (isMajorBrand(business.name)) {
          if (country) {
              peopleBody['person_locations'] = [country];
              console.log(`[Apollo Enrich] Added location filter for major brand: ${country}`);
          } else {
              console.log(`[Apollo Enrich] Could not determine country for major brand, searching without location filter.`);
          }
      } else if (addressParts.length >= 2) {
          // Extract city and state, ensuring proper "City, State" format
          const city = addressParts[addressParts.length - 2].trim();
          const statePart = addressParts[addressParts.length - 1].trim();
          // Extract state (first part before any additional info like ZIP)
          const state = statePart.split(' ')[0];
          
          // Ensure we have valid city and state
          if (city && state && city.length > 0 && state.length > 0) {
              peopleBody['person_locations'] = [`${city}, ${state}`];
              console.log(`[Apollo Enrich] Added location filter to Apollo search: ${city}, ${state}`);
          } else {
              console.log(`[Apollo Enrich] Could not parse valid city/state from address: ${business.address}`);
          }
      } else {
          console.log(`[Apollo Enrich] Address format not suitable for location filtering: ${business.address}`);
      }
    }

    console.log('[Apollo Enrich] Calling Apollo people search API:', peopleBody);

    const peopleRes = await fetch('https://api.apollo.io/v1/people/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': apolloApiKey },
      body: JSON.stringify(peopleBody),
    });

    if (!peopleRes.ok) throw new Error(`Apollo People API failed with status ${peopleRes.status}`);

    const peopleData = await peopleRes.json();
    
    console.log('[Apollo Enrich] Apollo People API response:', JSON.stringify(peopleData, null, 2));
    console.log('[Apollo Enrich] Apollo People API total entries:', peopleData.pagination?.total_entries || 0);
    
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
    
    // Process decision makers and handle locked emails
    const decisionMakers = await Promise.all((peopleData.people || []).map(async person => {
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
                businessName: business.name,
                placeId: business.placeId,
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
    
    // Update business with Apollo results
    business.decisionMakers = decisionMakers;
    business.apolloAttempted = true;
    await business.save();

    console.log(`[Apollo Enrich] Apollo enrichment completed for "${business.name}". Found ${decisionMakers.length} decision makers.`);

    res.json({
      success: true,
      message: 'Apollo enrichment completed successfully',
      decisionMakers: business.decisionMakers
    });

  } catch (error) {
    console.error(`[Apollo Enrich] Error for placeId ${placeId}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch from Apollo API',
      message: error.message 
    });
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

  // Get email activity counts for multiple businesses
  router.post('/email-activities/counts', async (req, res) => {
    try {
      const { businessIds } = req.body;
      
      if (!businessIds || !Array.isArray(businessIds)) {
        return res.status(400).json({ error: 'businessIds array is required' });
      }
      
      // Aggregate email counts by businessId
      const counts = await EmailActivity.aggregate([
        { $match: { businessId: { $in: businessIds } } },
        { $group: { _id: '$businessId', count: { $sum: 1 } } }
      ]);
      
      // Convert to object map for easier lookup
      const countsMap = {};
      counts.forEach(item => {
        countsMap[item._id] = item.count;
      });
      
      res.json({ counts: countsMap });
    } catch (error) {
      console.error('[EmailActivities] Error fetching counts:', error);
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
      const apolloContacts = history.filter(c => ['apollo_organization_enrich', 'apollo_people_search', 'apollo_person_match'].includes(c.api));
      
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

// Seed sample outreach data (for testing)
router.post('/dev/seed-outreach', async (req, res) => {
  try {
    console.log('[Seed Outreach] Starting to seed sample data...');
    
    // Get existing businesses
    const businesses = await Business.find({}).limit(10);
    
    if (businesses.length === 0) {
      return res.status(400).json({ 
        error: 'No businesses found in database. Please add some businesses first.' 
      });
    }
    
    console.log(`[Seed Outreach] Found ${businesses.length} businesses`);
    
    // Get actual templates from database
    const realTemplates = await EmailTemplate.find({});
    
    if (realTemplates.length === 0) {
      return res.status(400).json({ 
        error: 'No email templates found in database. Please initialize templates first (npm run init-db).' 
      });
    }
    
    console.log(`[Seed Outreach] Found ${realTemplates.length} templates`);
    
    const emailStatuses = ['sent', 'delivered', 'opened', 'clicked', 'bounced'];
    const emailTypes = ['test', 'real'];
    const subjects = [
      'Boost Your Online Presence with Our Marketing Solution',
      'Exclusive Offer: Grow Your Business Today',
      'Is Your Website Leaving Money on the Table?',
      'Quick Question About Your Digital Strategy',
      'We Can Help You Get More Customers'
    ];
    const templates = realTemplates.map(t => ({ id: t.id, name: t.name }));
    const decisionMakers = [
      { id: 'dm-1', name: 'John Smith', email: 'john.smith@example.com' },
      { id: 'dm-2', name: 'Maria Garcia', email: 'maria.garcia@example.com' },
      { id: 'dm-3', name: 'David Lee', email: 'david.lee@example.com' },
      { id: 'dm-4', name: 'Sarah Johnson', email: 'sarah.johnson@example.com' },
    ];
    
    const createdActivities = [];
    
    // Create 3-7 email activities per business
    for (const business of businesses) {
      const numEmails = Math.floor(Math.random() * 5) + 3; // 3-7 emails
      
      for (let i = 0; i < numEmails; i++) {
        const dm = decisionMakers[Math.floor(Math.random() * decisionMakers.length)];
        const template = templates[Math.floor(Math.random() * templates.length)];
        const subject = subjects[Math.floor(Math.random() * subjects.length)];
        const status = emailStatuses[Math.floor(Math.random() * emailStatuses.length)];
        const emailType = emailTypes[Math.floor(Math.random() * emailTypes.length)];
        
        // Generate timestamps
        const daysAgo = Math.floor(Math.random() * 30); // 0-30 days ago
        const sentAt = new Date();
        sentAt.setDate(sentAt.getDate() - daysAgo);
        sentAt.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
        
        const emailActivity = {
          emailId: `email-${business.id}-${Date.now()}-${i}`,
          businessId: business.id,
          businessName: business.name,
          decisionMakerId: dm.id,
          decisionMakerName: dm.name,
          decisionMakerEmail: dm.email,
          subject: subject,
          templateId: template.id,
          templateName: template.name,
          emailType: emailType,
          status: status,
          sentAt: sentAt,
          openCount: 0,
          clickCount: 0
        };
        
        // Add delivery timestamp (1-4 hours after sent)
        if (['delivered', 'opened', 'clicked'].includes(status)) {
          const deliveredAt = new Date(sentAt);
          deliveredAt.setHours(deliveredAt.getHours() + Math.floor(Math.random() * 4) + 1);
          emailActivity.deliveredAt = deliveredAt;
        }
        
        // Add opens for opened/clicked emails
        if (['opened', 'clicked'].includes(status)) {
          const openCount = Math.floor(Math.random() * 5) + 1; // 1-5 opens
          emailActivity.openCount = openCount;
          
          const openedAt = new Date(emailActivity.deliveredAt);
          openedAt.setHours(openedAt.getHours() + Math.floor(Math.random() * 48) + 1); // 1-48 hours after delivery
          emailActivity.openedAt = openedAt;
          emailActivity.lastOpenedAt = openedAt;
        }
        
        // Add clicks for clicked emails
        if (status === 'clicked') {
          const clickCount = Math.floor(Math.random() * 3) + 1; // 1-3 clicks
          emailActivity.clickCount = clickCount;
          
          const clickedAt = new Date(emailActivity.openedAt);
          clickedAt.setMinutes(clickedAt.getMinutes() + Math.floor(Math.random() * 60) + 5); // 5-65 minutes after opening
          emailActivity.clickedAt = clickedAt;
          emailActivity.lastClickedAt = clickedAt;
        }
        
        // Add bounce info for bounced emails
        if (status === 'bounced') {
          const bouncedAt = new Date(sentAt);
          bouncedAt.setMinutes(bouncedAt.getMinutes() + Math.floor(Math.random() * 30) + 5);
          emailActivity.bouncedAt = bouncedAt;
        }
        
        try {
          const savedActivity = await EmailActivity.create(emailActivity);
          createdActivities.push(savedActivity);
        } catch (error) {
          console.error('[Seed Outreach] Error creating email activity:', error);
        }
      }
    }
    
    console.log(`[Seed Outreach] Created ${createdActivities.length} email activities`);
    
    res.json({ 
      message: `Successfully created ${createdActivities.length} sample email activities for ${businesses.length} businesses`,
      created: createdActivities.length,
      businesses: businesses.length
    });
  } catch (error) {
    console.error('[Seed Outreach] Error seeding data:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Clear sample outreach data (for testing)
router.delete('/dev/clear-outreach', async (req, res) => {
  try {
    console.log('[Clear Outreach] Clearing all email activities...');
    
    const result = await EmailActivity.deleteMany({});
    
    console.log(`[Clear Outreach] Deleted ${result.deletedCount} email activities`);
    
    res.json({ 
      message: `Successfully deleted ${result.deletedCount} email activities`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('[Clear Outreach] Error clearing data:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Bulk delete businesses
router.post('/businesses/delete', async (req, res) => {
  const { placeIds } = req.body;
  try {
    if (!placeIds || !Array.isArray(placeIds) || placeIds.length === 0) {
      return res.status(400).json({ error: 'placeIds array is required' });
    }

    const result = await Business.deleteMany({ placeId: { $in: placeIds } });
    
    res.json({ 
      message: `Successfully deleted ${result.deletedCount} business(es)`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('[Bulk Delete] Error deleting businesses:', error);
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

// ==================== ICP (Ideal Customer Profile) Routes ====================

// Get all ICP configurations
router.get('/icp-configs', async (req, res) => {
  try {
    const configs = await ICPConfig.find({});
    
    // If no configs exist, initialize with defaults
    if (configs.length === 0) {
      console.log('[ICP] No configurations found. Creating defaults...');
      const defaultConfigs = getDefaultICPConfigs();
      const createdConfigs = await ICPConfig.insertMany(defaultConfigs);
      return res.json(createdConfigs);
    }
    
    res.json(configs);
  } catch (error) {
    console.error('[ICP] Error fetching ICP configs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single ICP configuration
router.get('/icp-configs/:id', async (req, res) => {
  try {
    const config = await ICPConfig.findById(req.params.id);
    
    if (!config) {
      return res.status(404).json({ error: 'ICP configuration not found' });
    }
    
    res.json(config);
  } catch (error) {
    console.error('[ICP] Error fetching ICP config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new ICP configuration
router.post('/icp-configs', async (req, res) => {
  try {
    const config = new ICPConfig(req.body);
    await config.save();
    res.json(config);
  } catch (error) {
    console.error('[ICP] Error creating ICP config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update an ICP configuration
router.put('/icp-configs/:id', async (req, res) => {
  try {
    const config = await ICPConfig.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );
    
    if (!config) {
      return res.status(404).json({ error: 'ICP configuration not found' });
    }
    
    res.json(config);
  } catch (error) {
    console.error('[ICP] Error updating ICP config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Calculate ICP score for a single business
router.post('/icp-score/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    const { icpType } = req.body; // 'midmarket' or 'independent'
    
    console.log(`[ICP Score] Request received for businessId: ${businessId}, icpType: ${icpType}`);
    
    const business = await Business.findOne({ id: businessId });
    
    if (!business) {
      console.log(`[ICP Score] Business not found: ${businessId}`);
      return res.status(404).json({ error: 'Business not found' });
    }
    
    console.log(`[ICP Score] Found business: ${business.name}`);
    
    // Check if websiteAnalysis is missing or outdated (older than 30 days)
    const needsWebsiteAnalysis = business.website && (
      !business.websiteAnalysis || 
      !business.websiteAnalysis.analyzedAt ||
      business.websiteAnalysis.hasSEO === null ||
      (new Date() - new Date(business.websiteAnalysis.analyzedAt)) > 30 * 24 * 60 * 60 * 1000
    );
    
    if (needsWebsiteAnalysis) {
      console.log(`[ICP Score] Website analysis missing or outdated, analyzing website: ${business.website}`);
      try {
        const { html: homepageHtml } = await fetchHtmlWithFallback(business.website, { noPuppeteer: false, debugMode: false });
        const websiteAnalysis = analyzeWebsiteForICP(homepageHtml, business.website);
        
        // Use atomic update to prevent race conditions
        await Business.updateOne(
          { id: businessId },
          { $set: { websiteAnalysis } }
        );
        
        // Update local business object for current calculation
        business.websiteAnalysis = websiteAnalysis;
        console.log(`[ICP Score] Website analysis completed and saved:`, websiteAnalysis);
      } catch (error) {
        console.error(`[ICP Score] Error analyzing website:`, error);
        // Continue with existing data even if analysis fails
      }
    } else if (business.websiteAnalysis) {
      console.log(`[ICP Score] Using existing website analysis from ${business.websiteAnalysis.analyzedAt}`);
    }
    
    const config = await ICPConfig.findOne({ type: icpType });
    
    if (!config) {
      console.log(`[ICP Score] ICP configuration not found for type: ${icpType}`);
      return res.status(404).json({ error: 'ICP configuration not found' });
    }
    
    console.log(`[ICP Score] Calculating score with config: ${config.name}`);
    console.log(`[ICP Score] Business data:`, {
      name: business.name,
      numLocations: business.numLocations,
      website: business.website,
      country: business.country,
      category: business.category,
      websiteAnalysis: business.websiteAnalysis
    });
    
    const result = calculateICPScore(business, config);
    
    console.log(`[ICP Score] Calculated score: ${result.score}/10`);
    console.log(`[ICP Score] Breakdown:`, JSON.stringify(result.breakdown, null, 2));
    
    // Update business with ICP score using atomic operation to prevent race conditions
    await Business.updateOne(
      { id: businessId },
      { 
        $set: {
          [`icpScores.${icpType}`]: {
            score: result.score,
            breakdown: result.breakdown,
            lastCalculated: result.calculatedAt
          }
        }
      }
    );
    
    console.log(`[ICP Score] Successfully saved score for ${business.name} (${icpType}): ${result.score}/10`);
    
    res.json({
      businessId,
      icpType,
      score: result.score,
      breakdown: result.breakdown,
      calculatedAt: result.calculatedAt
    });
  } catch (error) {
    console.error('[ICP Score] Error calculating ICP score:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk calculate ICP scores for all businesses
router.post('/icp-score/bulk-calculate', async (req, res) => {
  try {
    const { icpType } = req.body; // 'midmarket', 'independent', or 'both'
    
    const config = await ICPConfig.findOne({ 
      type: icpType === 'both' ? { $in: ['midmarket', 'independent'] } : icpType 
    });
    
    if (!config && icpType !== 'both') {
      return res.status(404).json({ error: 'ICP configuration not found' });
    }
    
    const businesses = await Business.find({});
    
    let processed = 0;
    let errors = 0;
    
    const configs = icpType === 'both' 
      ? await ICPConfig.find({}) 
      : [config];
    
    for (const business of businesses) {
      try {
        for (const cfg of configs) {
          const result = calculateICPScore(business, cfg);
          
          if (!business.icpScores) {
            business.icpScores = {};
          }
          business.icpScores[cfg.type] = {
            score: result.score,
            breakdown: result.breakdown,
            lastCalculated: result.calculatedAt
          };
        }
        
        await business.save();
        processed++;
      } catch (err) {
        console.error(`[ICP] Error processing business ${business.id}:`, err);
        errors++;
      }
    }
    
    res.json({
      message: 'Bulk ICP calculation completed',
      processed,
      errors,
      total: businesses.length
    });
  } catch (error) {
    console.error('[ICP] Error in bulk ICP calculation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset ICP configurations to defaults
router.post('/icp-configs/reset', async (req, res) => {
  try {
    await ICPConfig.deleteMany({});
    const defaultConfigs = getDefaultICPConfigs();
    const createdConfigs = await ICPConfig.insertMany(defaultConfigs);
    res.json({ 
      message: 'ICP configurations reset to defaults',
      configs: createdConfigs
    });
  } catch (error) {
    console.error('[ICP] Error resetting ICP configs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== GRADER ENDPOINTS =====

// Function to grade business quality
async function gradeBusiness(placeId) {
  try {
    // Check if we should use a mock response
    if (!process.env.RAY_GRADER_API_KEY || process.env.RAY_GRADER_API_KEY === 'demo-key') {
      console.log('[Grader] Using mock grader response (no API key or demo key)');
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
    
    // Construct the API URL
    let apiUrl;
    if (process.env.GRADER_BACKEND_URL) {
      // Remove trailing slash and ensure the path is correct
      const baseUrl = process.env.GRADER_BACKEND_URL.replace(/\/$/, '');
      // If the base URL already includes the full path, use it as is
      if (baseUrl.endsWith('/generate-report-v2')) {
        apiUrl = baseUrl;
      } else if (baseUrl.endsWith('/api')) {
        // If it ends with /api, just append the endpoint
        apiUrl = baseUrl + '/generate-report-v2';
      } else {
        // Otherwise, append the full path
        apiUrl = baseUrl + '/api/generate-report-v2';
      }
    } else {
      // Default URL
      apiUrl = 'https://grader.rayapp.io/api/generate-report-v2';
    }
    console.log(`[Grader] Full API URL: ${apiUrl}`);
    
    const requestBody = { 
      placeId: placeId,
      apiKey: process.env.RAY_GRADER_API_KEY
    };
    
    console.log(`[Grader] Request body: { placeId: "${placeId}", apiKey: "***" }`);
    
    const graderResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(180000) // 180 second timeout
    });

    if (!graderResponse.ok) {
      const errorText = await graderResponse.text();
      console.error(`[Grader] Grader API returned an error. Status: ${graderResponse.status}, Body: ${errorText}`);
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
        console.log('[Grader] Grader API returned a PDF, but the x-grader-score header was not found.');
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
          console.error(`[Grader] Failed to download PDF from url: ${reportData.pdfUrl}`);
        }
      }
      
      return {
        success: true,
        score: reportData.score,
        reportId: reportId,
      };
    } catch (error) {
        console.error('[Grader] Failed to parse JSON response from grader API. Logging headers and body.');
        console.error('[Grader] Grader API Response Headers:', JSON.stringify(Object.fromEntries(clonedResponse.headers.entries())));
        const responseBody = await clonedResponse.text();
        console.error('[Grader] Grader API Response Body (first 500 chars):', responseBody.substring(0, 500));
        
        throw error;
    }

  } catch (error) {
    console.error('[Grader] Error grading business:', error);
    throw error;
  }
}

// Endpoint to grade business quality
router.post('/grade-business', async (req, res) => {
  const { placeId } = req.body;

  if (!placeId) {
    return res.status(400).json({ error: 'placeId is required' });
  }

  try {
    const report = await gradeBusiness(placeId);
    res.json(report);
  } catch (error) {
    console.error('[Grader] Error in /grade-business endpoint:', error);
    res.status(500).json({ error: 'Failed to grade business' });
  }
});

// Endpoint to get a grade report by ID
router.get('/grade-report/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    
    if (!reportId) {
      return res.status(400).json({ error: 'Report ID is required' });
    }
    
    console.log(`[Grader] Fetching report with ID: ${reportId}`);
    
    // Check if this is a mock report ID
    if (reportId.startsWith('mock-')) {
      console.log('[Grader] Generating mock report HTML');
      
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
              background-color: #f5f5f5;
            }
            .report-header { 
              background: linear-gradient(to right, #4a6cf7, #8a54ff);
              color: white;
              padding: 20px;
              border-radius: 10px 10px 0 0;
            }
            .report-body {
              background: white;
              border: 1px solid #ddd;
              padding: 20px;
              border-radius: 0 0 10px 10px;
            }
            .score {
              font-size: 48px;
              font-weight: bold;
              margin: 20px 0;
              color: #4a6cf7;
            }
            .category {
              margin: 15px 0;
              padding: 15px;
              background-color: #f9f9f9;
              border-radius: 5px;
            }
            .category h3 {
              margin-top: 0;
              color: #333;
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
            <h1>🎯 RAY Grader Report</h1>
            <p>Generated on ${new Date().toLocaleDateString()} for Place ID: ${placeId}</p>
            <p style="opacity: 0.8; margin-top: 10px;">⚠️ This is a MOCK report for testing purposes</p>
          </div>
          
          <div class="report-body">
            <h2>Business Quality Score</h2>
            
            <div class="score">
              ${Math.floor(Math.random() * 40) + 60}/100
            </div>
            
            <div class="category">
              <h3>📱 Online Presence</h3>
              <p>Website quality, social media activity, and digital footprint</p>
              <div class="bar">
                <div class="bar-fill" style="width: ${Math.floor(Math.random() * 40) + 60}%"></div>
              </div>
            </div>
            
            <div class="category">
              <h3>⭐ Customer Reviews</h3>
              <p>Rating distribution, review count, and sentiment analysis</p>
              <div class="bar">
                <div class="bar-fill" style="width: ${Math.floor(Math.random() * 40) + 60}%"></div>
              </div>
            </div>
            
            <div class="category">
              <h3>📊 Business Information</h3>
              <p>Completeness and accuracy of business details</p>
              <div class="bar">
                <div class="bar-fill" style="width: ${Math.floor(Math.random() * 40) + 60}%"></div>
              </div>
            </div>
            
            <div class="category">
              <h3>🎨 Visual Content</h3>
              <p>Photo quality, quantity, and engagement metrics</p>
              <div class="bar">
                <div class="bar-fill" style="width: ${Math.floor(Math.random() * 40) + 60}%"></div>
              </div>
            </div>
            
            <div style="margin-top: 30px; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 5px;">
              <strong>Note:</strong> This is a mock report generated for demonstration purposes. 
              To access real grader data, configure RAY_GRADER_API_KEY in your environment.
            </div>
          </div>
        </body>
        </html>
      `;
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(mockHtml);
    }
    
    // For real report IDs, serve the PDF file
    const reportPath = path.join(__dirname, 'reports', `${reportId}.pdf`);
    
    try {
      await fs.access(reportPath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${reportId}.pdf"`);
      res.sendFile(reportPath);
    } catch (error) {
      console.error(`[Grader] Report file not found: ${reportPath}`);
      res.status(404).json({ error: 'Report not found' });
    }
  } catch (error) {
    console.error('[Grader] Error fetching grade report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

export default router;