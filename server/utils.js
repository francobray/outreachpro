import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import ApiCallLog from './models/ApiCallLog.js';
import { compareTwoStrings } from 'string-similarity';
import { parseStringPromise } from 'xml2js';

let puppeteer, puppeteerExtra, StealthPlugin, robotsParser;

export async function initPuppeteer() {
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

// Helper function to check robots.txt
export async function checkRobotsTxt(url) {
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

// Function to reset API call tracking from the database
export async function resetApiTracking() {
  try {
    await ApiCallLog.deleteMany({});
    console.log('[Tracking] API call logs reset in the database');
  } catch (error) {
    console.error('[Tracking] Error resetting API call logs:', error);
  }
}

// Function to get API call statistics from the database
export async function getApiTrackingStats() {
  try {
    const googlePlacesSearch = await ApiCallLog.countDocuments({ api: 'google_places_search' });
    const googlePlacesDetails = await ApiCallLog.countDocuments({ api: 'google_places_details' });
    const apolloContacts = await ApiCallLog.countDocuments({ api: { $in: ['apollo_organization_enrich', 'apollo_people_search', 'apollo_person_match'] } });
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
export async function getMonthlyStats(months = 2) {
  const now = new Date();
  const monthlyData = [];

  for (let i = 0; i < months; i++) {
    const targetMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const startOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
    const startOfNextMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 1);

    try {
      const calls = await ApiCallLog.aggregate([
        { $match: { timestamp: { $gte: startOfMonth, $lt: startOfNextMonth } } },
        { $group: { _id: '$api', count: { $sum: 1 } } }
      ]);

      const stats = {
        googlePlacesSearch: 0,
        googlePlacesDetails: 0,
        apolloContacts: 0
      };

      calls.forEach(call => {
        if (call._id === 'google_places_search') stats.googlePlacesSearch = call.count;
        if (call._id === 'google_places_details') stats.googlePlacesDetails = call.count;
        if (['apollo_organization_enrich', 'apollo_people_search', 'apollo_person_match'].includes(call._id)) {
          stats.apolloContacts += call.count;
        }
      });

      monthlyData.push({
        month: startOfMonth.toLocaleString('default', { month: 'long', year: 'numeric' }),
        stats: stats
      });
    } catch (error) {
      console.error(`[Tracking] Error getting stats for ${startOfMonth.toLocaleString('default', { month: 'long' })}:`, error);
      monthlyData.push({
        month: startOfMonth.toLocaleString('default', { month: 'long', year: 'numeric' }),
        stats: { googlePlacesSearch: 0, googlePlacesDetails: 0, apolloContacts: 0 }
      });
    }
  }
  
  return {
    lastSixMonths: monthlyData.reverse(),
    currentMonth: monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].stats : { googlePlacesSearch: 0, googlePlacesDetails: 0, apolloContacts: 0 },
    previousMonth: monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].stats : { googlePlacesSearch: 0, googlePlacesDetails: 0, apolloContacts: 0 }
  };
}

// Helper to extract a valid business domain from a website URL
export function extractDomain(website) {
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
export async function fetchHtmlWithPuppeteer(url) {
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
      '--ignore-certificate-errors', // Allow HTTPS errors
      '--allow-insecure-localhost', // Allow HTTP connections
      '--unsafely-treat-insecure-origin-as-secure=http://*', // Treat HTTP as secure
    ],
    ignoreHTTPSErrors: true // Also set at the browser level
  });
  
  try {
    const page = await browser.newPage();
    
    // Bypass SSL/certificate errors at page level
    await page.setBypassCSP(true);
    
    // Enable request interception to handle blocked resources gracefully
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      // Allow all requests to continue, even if they might be blocked
      // This prevents ERR_BLOCKED_BY_CLIENT from stopping page navigation
      request.continue().catch(() => {
        // Silently ignore if request was already handled
      });
    });
    
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
    
    // Navigate with timeout and wait until DOM is loaded
    console.log(`[Puppeteer] Navigating to ${url}`);
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded', // More forgiving than networkidle2
        timeout: 30000
      });
    } catch (navError) {
      // If navigation fails due to blocked resources, that's okay - the page might have loaded anyway
      if (navError.message.includes('ERR_BLOCKED_BY_CLIENT')) {
        console.log(`[Puppeteer] Some resources were blocked, but proceeding to extract content...`);
        // Don't throw - the page might have loaded enough content for us to scrape
        // We'll check if we got valid HTML below
      } else if (navError.message.includes('Timeout') || navError.message.includes('timeout')) {
        console.log(`[Puppeteer] Navigation timeout, but page may have loaded. Proceeding...`);
        // Also don't throw on timeout - page might have partial content
      } else {
        throw navError;
      }
    }
    
    // Wait a bit to ensure all content is loaded with random timing
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 1000));
    
    // Perform random mouse movements to simulate human behavior
    try {
      await simulateHumanBehavior(page);
    } catch (behaviorError) {
      console.log(`[Puppeteer] Behavior simulation skipped: ${behaviorError.message}`);
    }
    
    // Scroll down to trigger any lazy-loaded content
    try {
      await autoScroll(page);
    } catch (scrollError) {
      console.log(`[Puppeteer] Auto-scroll skipped: ${scrollError.message}`);
    }
    
    // Wait for potential dynamic content
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1500) + 500));
    
    // Get the page content
    const html = await page.content();
    
    // Validate we got some content
    if (!html || html.length < 100) {
      throw new Error(`Page loaded but got insufficient content: ${html.length} bytes`);
    }
    
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
export async function simulateHumanBehavior(page) {
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
export async function autoScroll(page) {
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
export function normalizeAndDeduplicateEmails(emails) {
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
export async function fetchHtmlWithFallback(url, options = {}) {
  const { noPuppeteer = false, debugMode = process.env.DEBUG_SCRAPER === 'true' || false, maxRetries = 3 } = options;
  
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
export async function fallbackToPuppeteer(url, debugMode, noPuppeteer) {
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

// Helper function to get Google Places API costs
export async function getGooglePlacesCosts() {
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
export async function getApolloCosts() {
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

/**
 * Fetch and parse sitemap.xml from a website
 * @param {string} baseUrl - Base URL of the website
 * @returns {Promise<Object>} - Parsed sitemap with categorized URLs
 */
export const parseSitemap = async (baseUrl) => {
  console.log(`[Sitemap] Fetching sitemap for ${baseUrl}`);
  
  const result = {
    found: false,
    urls: [],
    categorized: {
      locations: [],
      contact: [],
      about: [],
      menu: [],
      other: []
    }
  };

  try {
    // Normalize base URL
    const url = new URL(baseUrl);
    const sitemapUrl = `${url.protocol}//${url.host}/sitemap.xml`;
    
    console.log(`[Sitemap] Trying: ${sitemapUrl}`);
    
    // Check robots.txt first (optional, best practice)
    const canAccess = await checkRobotsTxt(sitemapUrl);
    if (!canAccess) {
      console.log(`[Sitemap] Access blocked by robots.txt`);
      return result;
    }
    
    // Fetch sitemap
    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OutreachPro/1.0; +https://outreachpro.com)'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      console.log(`[Sitemap] Not found or inaccessible (${response.status})`);
      return result;
    }
    
    const xmlContent = await response.text();
    
    // Parse XML
    const parsed = await parseStringPromise(xmlContent, {
      trim: true,
      normalize: true,
      explicitArray: false
    });
    
    console.log(`[Sitemap] Successfully parsed sitemap.xml`);
    
    // Handle sitemap index (contains multiple sitemaps)
    if (parsed.sitemapindex) {
      console.log(`[Sitemap] Found sitemap index`);
      const sitemaps = Array.isArray(parsed.sitemapindex.sitemap) 
        ? parsed.sitemapindex.sitemap 
        : [parsed.sitemapindex.sitemap];
      
      // Fetch first sitemap from index (limit to avoid too many requests)
      if (sitemaps.length > 0 && sitemaps[0].loc) {
        const firstSitemapUrl = sitemaps[0].loc;
        console.log(`[Sitemap] Fetching first sitemap from index: ${firstSitemapUrl}`);
        
        const subResponse = await fetch(firstSitemapUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; OutreachPro/1.0; +https://outreachpro.com)'
          },
          timeout: 10000
        });
        
        if (subResponse.ok) {
          const subXml = await subResponse.text();
          const subParsed = await parseStringPromise(subXml, {
            trim: true,
            normalize: true,
            explicitArray: false
          });
          
          if (subParsed.urlset && subParsed.urlset.url) {
            result.urls = extractUrlsFromSitemap(subParsed);
          }
        }
      }
    }
    // Handle regular sitemap
    else if (parsed.urlset && parsed.urlset.url) {
      result.urls = extractUrlsFromSitemap(parsed);
    }
    
    if (result.urls.length > 0) {
      result.found = true;
      result.categorized = categorizeUrls(result.urls);
      
      console.log(`[Sitemap] Found ${result.urls.length} URLs:`);
      console.log(`[Sitemap]   - Locations: ${result.categorized.locations.length}`);
      console.log(`[Sitemap]   - Contact: ${result.categorized.contact.length}`);
      console.log(`[Sitemap]   - About: ${result.categorized.about.length}`);
      console.log(`[Sitemap]   - Menu: ${result.categorized.menu.length}`);
      console.log(`[Sitemap]   - Other: ${result.categorized.other.length}`);
    } else {
      console.log(`[Sitemap] No URLs found in sitemap`);
    }
    
    return result;
    
  } catch (error) {
    console.log(`[Sitemap] Error parsing sitemap: ${error.message}`);
    return result;
  }
};

/**
 * Extract URLs from parsed sitemap object
 * @param {Object} parsed - Parsed sitemap XML
 * @returns {Array<string>} - Array of URLs
 */
function extractUrlsFromSitemap(parsed) {
  const urls = [];
  
  if (parsed.urlset && parsed.urlset.url) {
    const urlEntries = Array.isArray(parsed.urlset.url) 
      ? parsed.urlset.url 
      : [parsed.urlset.url];
    
    urlEntries.forEach(entry => {
      if (entry.loc) {
        urls.push(entry.loc);
      }
    });
  }
  
  return urls;
}

/**
 * Categorize URLs from sitemap into different types
 * @param {Array<string>} urls - Array of URLs
 * @returns {Object} - Categorized URLs
 */
function categorizeUrls(urls) {
  const categorized = {
    locations: [],
    contact: [],
    about: [],
    menu: [],
    other: []
  };
  
  // Patterns for categorization
  const patterns = {
    locations: [
      /\/location(s)?/i,
      /\/store(s)?/i,
      /\/branch(es)?/i,
      /\/locale(s)?/i,
      /\/sucursal(es)?/i,
      /\/tienda(s)?/i,
      /\/lojas?/i, // Portuguese
      /\/negozi/i, // Italian
      /\/find-us/i,
      /\/where-to-find/i
    ],
    contact: [
      /\/contact(o)?/i,
      /\/contacto/i,
      /\/contato/i,
      /\/contatti/i,
      /\/get-in-touch/i,
      /\/reach-us/i
    ],
    about: [
      /\/about/i,
      /\/sobre/i,
      /\/chi-siamo/i,
      /\/quienes-somos/i,
      /\/nosotros/i,
      /\/our-story/i,
      /\/historia/i
    ],
    menu: [
      /\/menu/i,
      /\/carta/i,
      /\/food/i,
      /\/products?/i,
      /\/shop/i,
      /\/store/i,
      /\/order/i,
      /\/pedir/i
    ]
  };
  
  urls.forEach(url => {
    let categorizedFlag = false;
    
    // Check each category
    for (const [category, categoryPatterns] of Object.entries(patterns)) {
      if (categoryPatterns.some(pattern => pattern.test(url))) {
        categorized[category].push(url);
        categorizedFlag = true;
        break; // Only categorize once
      }
    }
    
    // If not categorized, add to "other"
    if (!categorizedFlag) {
      categorized.other.push(url);
    }
  });
  
  return categorized;
}

/**
 * Analyze website for ICP-related variables
 * @param {string} html - Homepage HTML
 * @param {string} website - Base URL
 * @returns {Object} - Website analysis results
 */
export const analyzeWebsiteForICP = (html, website) => {
  console.log(`[Website Analysis] Starting analysis for ${website}`);
  const analysis = {
    hasSEO: null,
    hasWhatsApp: null,
    hasReservation: null,
    hasDirectOrdering: null,
    hasThirdPartyDelivery: null,
    analyzedAt: new Date()
  };

  const htmlLower = html.toLowerCase();
  const $ = cheerio.load(html);

  // 1. Check for SEO/AEO practices
  const hasTitle = $('title').length > 0 && $('title').text().trim().length > 0;
  const hasMetaDescription = $('meta[name="description"]').length > 0 && $('meta[name="description"]').attr('content')?.trim().length > 0;
  const hasH1 = $('h1').length > 0;
  const hasStructuredData = $('script[type="application/ld+json"]').length > 0;
  
  // Consider good SEO if at least 3 of the 4 criteria are met
  const seoScore = [hasTitle, hasMetaDescription, hasH1, hasStructuredData].filter(Boolean).length;
  analysis.hasSEO = seoScore >= 3;
  console.log(`[Website Analysis]   SEO: ${analysis.hasSEO} (score: ${seoScore}/4)`);

  // 2. Check for WhatsApp
  const whatsappPatterns = [
    /wa\.me/i,
    /api\.whatsapp\.com/i,
    /whatsapp/i,
    /href="https?:\/\/[^"]*whatsapp[^"]*"/i
  ];
  analysis.hasWhatsApp = whatsappPatterns.some(pattern => pattern.test(htmlLower));
  console.log(`[Website Analysis]   WhatsApp: ${analysis.hasWhatsApp}`);

  // 3. Check for Reservation CTAs (English, Spanish, Italian, Portuguese)
  // Using more specific patterns to avoid false positives like "derechos reservados"
  const reservationPatterns = [
    // English
    /\breservation\b/i,
    /\breserve a table\b/i,
    /\bbook a table\b/i,
    /\bbook now\b/i,
    /\bmake a booking\b/i,
    /\btable reservation\b/i,
    // Spanish - specific phrases for table booking
    /\breserva\s+(tu|su|una)\s+mesa\b/i,  // "reserva tu/su/una mesa"
    /\breservar\s+mesa\b/i,                // "reservar mesa"
    /\breservas\s+online\b/i,              // "reservas online"
    /\bhacer\s+(una\s+)?reserva\b/i,       // "hacer (una) reserva"
    /\breservaciones\b/i,                  // "reservaciones"
    // Italian
    /\bprenotazione\b/i,
    /\bprenota\s+(un\s+)?tavolo\b/i,       // "prenota (un) tavolo"
    /\bprenotare\b/i,
    // Portuguese
    /\breservar\s+mesa\b/i,                // "reservar mesa"
    /\bfazer\s+reserva\b/i,                // "fazer reserva"
    /\breserva\s+online\b/i,               // "reserva online"
    // Platforms
    /\bopentable\b/i,
    /\bresy\b/i,
    /\btock\b/i,
    /\byelp\s+reservations\b/i,
    /\btablein\b/i,
    /\bpastarossaonline\b/i,
    /href="[^"]*opentable\.com/i,
    /href="[^"]*resy\.com/i,
    /href="[^"]*exploretock\.com/i,
    /href="[^"]*pastarossaonline\.com/i
  ];
  
  // Exclude false positives
  const falsePositivePatterns = [
    /derechos\s+reservados/i,              // "derechos reservados" (rights reserved)
    /rights\s+reserved/i,                  // "rights reserved"
    /diritti\s+riservati/i,                // "diritti riservati" (Italian rights reserved)
    /todos\s+os\s+direitos\s+reservados/i  // Portuguese rights reserved
  ];
  
  let hasReservationMatch = reservationPatterns.some(pattern => pattern.test(htmlLower));
  const hasFalsePositive = falsePositivePatterns.some(pattern => pattern.test(htmlLower));
  
  // If we found a match but it's likely a false positive, do additional validation
  if (hasReservationMatch && hasFalsePositive) {
    // Only count as reservation if we have strong indicators
    const strongIndicators = [
      /\breserva\s+(tu|su|una)\s+mesa\b/i,
      /\breservar\s+mesa\b/i,
      /\btable\s+reservation\b/i,
      /\bbook\s+a\s+table\b/i,
      /\bopentable\b/i,
      /\bresy\b/i,
      /href="[^"]*opentable\.com/i,
      /href="[^"]*resy\.com/i
    ];
    hasReservationMatch = strongIndicators.some(pattern => pattern.test(htmlLower));
  }
  
  analysis.hasReservation = hasReservationMatch;
  console.log(`[Website Analysis]   Reservation: ${analysis.hasReservation}`);

  // 4. Check for Third Party Delivery (Global and Regional platforms)
  const thirdPartyPatterns = [
    // North America
    /ubereats\.com/i,
    /doordash\.com/i,
    /grubhub\.com/i,
    /postmates\.com/i,
    /seamless\.com/i,
    /uber eats/i,
    /door dash/i,
    // Europe
    /deliveroo\./i,
    /just-eat\./i,
    /justeat\./i,
    /glovo\./i,
    // Latin America
    /rappi\./i,
    /pedidosya\./i,
    /pedidos ya/i,
    /ifood\./i,
    // Asia
    /foodpanda\./i,
    /grab\./i,
    // General keywords
    /delivery partner/i,
    /third.party.delivery/i
  ];
  analysis.hasThirdPartyDelivery = thirdPartyPatterns.some(pattern => pattern.test(htmlLower));
  console.log(`[Website Analysis]   Third Party Delivery: ${analysis.hasThirdPartyDelivery}`);

  // 5. Check for Direct Ordering (Multilingual)
  // Use more specific patterns to avoid false positives from third-party delivery mentions
  const strongDirectOrderingIndicators = [
    // Shopping cart / checkout systems
    /add\s+to\s+cart/i,
    /añadir\s+al\s+carrito/i,
    /agregar\s+al\s+carrito/i,
    /aggiungi\s+al\s+carrello/i,
    /adicionar\s+ao\s+carrinho/i,
    /\bcheckout\b/i,
    /\bcarrito\b.*\bcompra/i,
    /shopping\s+cart/i,
    
    // Online ordering platforms (owned systems)
    /order\s+online/i,
    /pedir\s+online/i,
    /pedido\s+online/i,
    /ordina\s+online/i,
    /online\s+ordering/i,
    /place\s+(your\s+)?order/i,
    /hacer\s+(tu\s+)?pedido/i,
    
    // E-commerce platforms
    /shopify/i,
    /woocommerce/i,
    /square\s+online/i,
    /toast\s+takeout/i,
    /chownow/i,
    /slice/i,
    /olo\./i,
    /direct\s+order/i,
    /own\s+ordering/i
  ];
  
  // Check for strong indicators
  const hasStrongIndicators = strongDirectOrderingIndicators.some(pattern => pattern.test(htmlLower));
  
  // Check for form elements that suggest ordering functionality
  const hasOrderForm = $('form').toArray().some(form => {
    const formText = $(form).text().toLowerCase();
    return /order|pedir|pedido|ordenar|ordina|checkout|carrito|cart/i.test(formText);
  });
  
  // Check for shopping cart elements
  const hasCartElements = $(
    '.cart, .shopping-cart, .carrito, .checkout, ' +
    '[class*="cart"], [class*="carrito"], [class*="checkout"], ' +
    '[id*="cart"], [id*="carrito"], [id*="checkout"]'
  ).length > 0;
  
  // Only mark as direct ordering if we have strong evidence
  // If only third-party delivery is found, don't count generic "order" or "delivery" keywords
  analysis.hasDirectOrdering = hasStrongIndicators || hasOrderForm || hasCartElements;
  
  console.log(`[Website Analysis]   Direct Ordering: ${analysis.hasDirectOrdering}`);

  console.log(`[Website Analysis] Completed analysis for ${website}`);
  return analysis;
};

// Detect locations from the homepage HTML
export const detectLocations = async (html, baseUrl, options = {}) => {
  const { noPuppeteer = false, debugMode = false, sitemapData = null } = options;
  let locationSet = new Set();
  let hasLocationsPage = false;
  let usedPuppeteer = false;
  const $ = cheerio.load(html);

  // Try to find a 'locations' page link or section (multilingual: English, Spanish, Italian, Portuguese)
  const locationPageKeywords = [
    // English
    'location', 'locations', 'contact', 'store', 'stores', 'shop', 'shops', 'find-us', 'branches', 
    'contact-us', 'retail-store-locations', 'our-locations', 'find-a-store', 'our-shops',
    // Spanish
    'ubicacion', 'ubicaciones', 'sucursal', 'sucursales', 'locales', 'local', 'tiendas', 'tienda',
    'nuestras-ubicaciones', 'nuestros-locales', 'donde-estamos', 'encuentranos', 
    'puntos-de-venta', 'nuestras-sucursales',
    // Italian
    'posizione', 'posizioni', 'sede', 'sedi', 'negozi', 'dove-siamo',
    // Portuguese
    'localizacao', 'localizacoes', 'onde-estamos', 'nossos-locais', 'lojas'
  ];
  let locationsPageUrl = null;

  // First, check sitemap data if available
  if (sitemapData && sitemapData.found && sitemapData.categorized.locations.length > 0) {
    console.log(`[PlaceDetails] Found ${sitemapData.categorized.locations.length} location page(s) in sitemap`);
    // Use the first locations page from sitemap
    locationsPageUrl = sitemapData.categorized.locations[0];
    console.log(`[PlaceDetails] Using locations page from sitemap: ${locationsPageUrl}`);
  }

  // First, check for location cards/sections on the homepage
  // Look for common patterns: cards, location items, address blocks, etc.
  // BE CONSERVATIVE: Only look for explicit location-related selectors to avoid false positives
  const locationSelectors = [
    '[data-location-id]', '[data-location]', 
    '.location-item', '.location-card', '.location', '.address-block',
    '.sucursal', '.sede', '.local', '.branch', '.store', '.store-location',
    '[class*="location"]', '[class*="sucursal"]', '[class*="branch"]', '[class*="store-location"]'
  ];
  
  const locationElements = $(locationSelectors.join(', '));
  console.log(`[PlaceDetails] Found ${locationElements.length} potential location elements on homepage`);
  
  if (locationElements.length >= 3) { // If we have 3+ location elements
    locationElements.each((i, el) => {
      // Try to extract location info from the card/element
      const $el = $(el);
      const elementText = $el.text().trim();
      
      // Split by lines and look for address-like content
      const lines = elementText.split('\n').map(l => l.trim()).filter(l => l.length > 5);
      
      lines.forEach(line => {
        const hasNumber = /\d+/.test(line);
        const hasCommaOrDelimiter = /[,|]/.test(line);
        // More specific street/avenue keywords to avoid matching city names as street names
        const addressKeywords = /(av\.|avenue|street|st\.|calle|avenida|ruta|route|camino|paseo|boulevard|blvd)/i;
        
        // Exclude obvious false positives: product names, menu items, short strings, numbers-only
        const falsePositivePatterns = [
          /^\d+$/, // Just numbers
          /^[a-z\s]+$/i, // Just words without structure
          /(chocolate|vanilla|strawberry|flavor|taste|ingredients|cream|ice|gelato|sorbet|kg|gr|ml|lt)/i, // Food/product terms
          /^\d+\s*(kg|gr|g|ml|l|lt|oz|lb)/i // Measurements
        ];
        
        const isFalsePositive = falsePositivePatterns.some(pattern => pattern.test(line));
        
        // If it looks like an address or location name AND is not a false positive
        if (!isFalsePositive && (hasNumber && (hasCommaOrDelimiter || addressKeywords.test(line)))) {
          if (line.length > 15 && line.length < 150) { // Require longer text for valid addresses
            locationSet.add(line);
          }
        }
      });
      
      // Also check for data attributes
      const locationId = $el.attr('data-location-id') || $el.attr('data-location');
      if (locationId && locationId.length > 2 && locationId.length < 100 && !/^[0-9]+$/.test(locationId)) {
        locationSet.add(locationId);
      }
    });
    
    if (locationSet.size >= 3) { // Confirmed multi-location
      console.log(`[PlaceDetails] Detected ${locationSet.size} locations from homepage elements`);
      return { numLocations: locationSet.size, locationNames: Array.from(locationSet), usedPuppeteer };
    }
  }

  // If no location elements found, try to find a 'locations' page link
  // But exclude external social media and other domains
  const excludedDomains = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'whatsapp.com'];
  
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (href) {
      const lowerHref = href.toLowerCase();
      
      // Skip external social media links
      if (excludedDomains.some(domain => lowerHref.includes(domain))) {
        return true; // Continue to next link
      }
      
      // Only consider internal links or relative paths
      if (lowerHref.startsWith('http') && !lowerHref.includes(new URL(baseUrl).hostname)) {
        return true; // Skip external links
      }
      
      if (locationPageKeywords.some(keyword => lowerHref.includes(keyword))) {
        locationsPageUrl = href;
        return false; // Stop searching once a likely candidate is found
      }
    }
  });

  // Only proceed if we found a locations page from sitemap or homepage HTML
  if (locationsPageUrl) {
    try {
      const absoluteLocationsUrl = new URL(locationsPageUrl, baseUrl).href;
      console.log(`[PlaceDetails] Found potential locations page: ${absoluteLocationsUrl}`);
      hasLocationsPage = true;
      console.log(`[PlaceDetails] Fetching locations page: ${absoluteLocationsUrl}`);
      const { html: locationsPageHtml, usedPuppeteer: locationsPageUsedPuppeteer } = await fetchHtmlWithFallback(absoluteLocationsUrl, { noPuppeteer, debugMode });
      if (locationsPageUsedPuppeteer) {
        usedPuppeteer = true;
      }
      
      const $$ = cheerio.load(locationsPageHtml);
      
      // Strategy 1: Look for location/address cards and sections
      // BE CONSERVATIVE: Only look for explicit location-related selectors
      const locationSelectors = [
        '.location', '.location-card', '.location-item', '.address', '.address-block',
        '.sucursal', '.sede', '.local', '.branch', '.store', '.store-location',
        '[class*="location"]', '[class*="sucursal"]', '[class*="branch"]', '[class*="store-location"]'
      ];
      
      $$(locationSelectors.join(', ')).each((i, el) => {
        // Get all text content from this element
        const elementText = $$(el).text().trim();
        
        // Look for patterns that suggest this is a location:
        // - Contains a number followed by text (street address)
        // - Contains city/neighborhood names
        // - Has comma-separated components
        
        // International address pattern (more flexible):
        // Examples:
        // - "Av. Callao 1402, C1024AAN CABA, Argentina"
        // - "Mitre 202, Bariloche, Río Negro"
        // - "123 Main St, New York, NY 10001"
        const lines = elementText.split('\n').map(l => l.trim()).filter(l => l.length > 5);
        
        // Exclude obvious false positives
        const falsePositivePatterns = [
          /^\d+$/, // Just numbers
          /^[a-z\s]+$/i, // Just words without structure
          /(chocolate|vanilla|strawberry|flavor|taste|ingredients|cream|ice|gelato|sorbet|kg|gr|ml|lt)/i, // Food/product terms
          /^\d+\s*(kg|gr|g|ml|l|lt|oz|lb)/i // Measurements
        ];
        
        // Look for lines that look like addresses (contain numbers and commas, or typical address keywords)
        lines.forEach(line => {
          // Check if line contains address-like patterns
          const hasNumber = /\d+/.test(line);
          const hasCommaOrDelimiter = /[,|]/.test(line);
          const addressKeywords = /(av\.|avenue|street|st\.|calle|avenida|ruta|route|camino|paseo|boulevard|blvd)/i;
          
          const isFalsePositive = falsePositivePatterns.some(pattern => pattern.test(line));
          
          // If it looks like an address or location name, add it
          if (!isFalsePositive && ((hasNumber && hasCommaOrDelimiter) || addressKeywords.test(line))) {
            if (line.length > 15 && line.length < 150) { // Require longer text for valid addresses
              locationSet.add(line);
            }
          }
        });
      });
 
      // Strategy 2: If structured search found locations, use them
      if (locationSet.size > 0) {
        console.log(`[PlaceDetails] Found ${locationSet.size} locations from structured search`);
      } else {
        // Strategy 3: Fall back to regex patterns on full page
        console.log(`[PlaceDetails] Structured search failed. Trying regex patterns on full page.`);
        const bodyText = $$('body').text();
        
        // More flexible international address patterns
        const addressPatterns = [
          // Argentine/Latin American style: "Street Name Number, City, Province"
          /(?:Av\.|Avenida|Calle|C\.|Ruta|Paseo|Boulevard)[\s\w.]+\d+[\s\w.,#()-]{5,80}/gi,
          // US style: "123 Street Name, City, ST 12345"
          /\d+\s+[\w\s.]+(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Drive|Dr\.|Boulevard|Blvd\.)[,\s]+[\w\s]+,\s*[A-Z]{2}\s+\d{5}/gi,
          // General: Number + street name + comma + location
          /\d+\s+[A-Za-zÀ-ÿ\s.'-]+[,]\s*[A-Za-zÀ-ÿ\s,'-]+/g
        ];
        
        addressPatterns.forEach(pattern => {
          const matches = bodyText.match(pattern);
          if (matches) {
            matches.forEach(match => {
              const cleaned = match.trim();
              if (cleaned.length > 10 && cleaned.length < 150) {
                locationSet.add(cleaned);
              }
            });
          }
        });
      }
      
      // Strategy 4: If still no locations and we haven't used Puppeteer yet, try with JavaScript rendering
      if (locationSet.size === 0 && !noPuppeteer && !locationsPageUsedPuppeteer) {
        console.log(`[PlaceDetails] No locations found with regular fetch. Trying with Puppeteer to render JavaScript...`);
        try {
          // Directly use Puppeteer to render JavaScript content
          const { html: puppeteerHtml, usedPuppeteer: didUsePuppeteer } = await fallbackToPuppeteer(absoluteLocationsUrl, debugMode, false);
          
          usedPuppeteer = true;
          console.log(`[PlaceDetails] Puppeteer rendered the page, re-analyzing...`);
          console.log(`[PlaceDetails] HTML length: ${puppeteerHtml.length} bytes`);
          
          const $$$ = cheerio.load(puppeteerHtml);
          
          // Debug: Log sample of visible text to understand page structure
          const sampleText = $$$('body').text().substring(0, 500);
          console.log(`[PlaceDetails] Sample of page text: ${sampleText.substring(0, 200)}...`);
          
          // Debug: Check for data attributes that might contain locations
          const elementsWithData = $$$('[data-address], [data-location], [data-lat], [data-lng]').length;
          console.log(`[PlaceDetails] Found ${elementsWithData} elements with location data attributes`);
          
          // Extract from data attributes first
          $$$('[data-address]').each((i, el) => {
            const address = $$$(el).attr('data-address');
            if (address && address.length > 10 && address.length < 150) {
              locationSet.add(address.trim());
            }
          });
          $$$('[data-location]').each((i, el) => {
            const location = $$$(el).attr('data-location');
            if (location && location.length > 10 && location.length < 150) {
              locationSet.add(location.trim());
            }
          });
          
          if (locationSet.size > 0) {
            console.log(`[PlaceDetails] Found ${locationSet.size} locations from data attributes`);
          }
          
          // Try structured search on Puppeteer-rendered content
          $$$(locationSelectors.join(', ')).each((i, el) => {
            const elementText = $$$(el).text().trim();
            const lines = elementText.split('\n').map(l => l.trim()).filter(l => l.length > 5);
            
            lines.forEach(line => {
              const hasNumber = /\d+/.test(line);
              const hasCommaOrDelimiter = /[,|]/.test(line);
              const addressKeywords = /(av\.|avenue|street|st\.|calle|avenida|ruta|route|camino|paseo|boulevard|blvd)/i;
              
              if ((hasNumber && hasCommaOrDelimiter) || addressKeywords.test(line)) {
                if (line.length > 10 && line.length < 150) {
                  locationSet.add(line);
                }
              }
            });
          });
          
          // If structured search still found nothing, try aggressive regex on full HTML
          if (locationSet.size === 0) {
            console.log(`[PlaceDetails] Structured search on Puppeteer HTML failed. Trying regex patterns on full page...`);
            
            // First, try to extract data from script tags containing JSON
            $$$('script').each((i, el) => {
              const scriptContent = $$$(el).html();
              if (scriptContent && (scriptContent.includes('location') || scriptContent.includes('address') || scriptContent.includes('sucursal'))) {
                // Try to find address-like strings in JSON data
                const jsonAddressPattern = /["'](?:address|direccion|ubicacion|location)["']:\s*["']([^"']+)["']/gi;
                let match;
                while ((match = jsonAddressPattern.exec(scriptContent)) !== null) {
                  const address = match[1].trim();
                  if (address.length > 10 && address.length < 150) {
                    locationSet.add(address);
                  }
                }
              }
            });
            
            if (locationSet.size > 0) {
              console.log(`[PlaceDetails] Found ${locationSet.size} locations in script tags`);
            } else {
              // If no JSON data, try aggressive regex on full HTML text
              const bodyText = puppeteerHtml;
              
              // Stricter regex patterns for addresses - require street keywords
              const addressPatterns = [
                // Spanish/Latin addresses: "Av. Corrientes 1234" or "Calle Florida 567"
                /(?:Av\.|Avenida|Calle|Paseo|Boulevard|Blvd\.?)\s+[A-Za-zÀ-ÿ\s\.]+\s+\d{2,5}(?:,\s*[A-Za-zÀ-ÿ\s]+)?/gi,
                // English addresses: "123 Main Street" or "456 Park Avenue"
                /\b\d{1,5}\s+[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,4}\s+(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Boulevard|Blvd\.)\b/gi,
                // Ruta/Route addresses
                /(?:Ruta|Route|Camino)\s+\d+\s+(?:km|Km|KM)?\s*\d*(?:,\s*[A-Za-zÀ-ÿ\s]+)?/gi
              ];
              
              addressPatterns.forEach(pattern => {
                const matches = bodyText.match(pattern);
                if (matches) {
                  matches.forEach(match => {
                    const cleaned = match.trim();
                    
                    // Filter out false positives
                    const isCopyright = /copyright/i.test(cleaned);
                    const isDateOnly = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i.test(cleaned);
                    const isYearOnly = /^\d{4}$/i.test(cleaned);
                    const hasInvalidWords = /(copyright|®|™|all rights|reserved|privacy|terms|cookie)/i.test(cleaned);
                    
                    // More lenient for Puppeteer results - accept shorter matches
                    if (cleaned.length > 8 && cleaned.length < 150 && 
                        !isCopyright && !isDateOnly && !isYearOnly && !hasInvalidWords) {
                      locationSet.add(cleaned);
                    }
                  });
                }
              });
              
              console.log(`[PlaceDetails] After regex on Puppeteer HTML: found ${locationSet.size} locations`);
            }
          }
          
          // Last resort: Extract all visible text and look for addresses
          if (locationSet.size === 0) {
            console.log(`[PlaceDetails] Still no locations. Extracting all visible text...`);
            const allText = $$$('body').text();
            const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            lines.forEach(line => {
              // Look for lines that look like addresses
              const hasNumber = /\d+/.test(line);
              const hasAddressKeyword = /(av\.|avenue|avenida|calle|street|st\.|ruta|route|camino|paseo|boulevard|blvd|road|rd)/i.test(line);
              const hasCommaOrCoordinates = /[,|]/.test(line);
              
              // Filter out false positives
              const isCopyright = /copyright/i.test(line);
              const isDateOnly = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i.test(line);
              const hasInvalidWords = /(copyright|®|™|all rights|reserved|privacy|terms|cookie|subscribe|follow|social|chrome:\/\/|attackers|secure connection)/i.test(line);
              
              if (hasNumber && (hasAddressKeyword || hasCommaOrCoordinates)) {
                if (line.length > 8 && line.length < 150 && 
                    !line.includes('http') && !line.includes('www') &&
                    !isCopyright && !isDateOnly && !hasInvalidWords) {
                  locationSet.add(line);
                }
              }
            });
            
            console.log(`[PlaceDetails] After all visible text extraction: found ${locationSet.size} locations`);
          }
          
          console.log(`[PlaceDetails] After Puppeteer: found ${locationSet.size} locations`);
        } catch (puppeteerError) {
          console.log(`[PlaceDetails] Puppeteer failed: ${puppeteerError.message}`);
        }
      }
    } catch (error) {
      console.error(`[PlaceDetails] Error processing locations page ${locationsPageUrl}:`, error);
    }
  } else {
    console.log(`[PlaceDetails] No locations page link found. Analyzing homepage for location details.`);
    
    // Try to find location sections on the homepage itself
    // BE CONSERVATIVE: Only look for explicit location-related selectors
    const locationSelectors = [
      '.location', '.location-card', '.location-item', '.address', '.address-block',
      '.sucursal', '.sede', '.local', '.branch', '.store', '.store-location',
      '[class*="location"]', '[class*="sucursal"]', '[class*="branch"]', '[class*="store-location"]'
    ];
    
    const falsePositivePatterns = [
      /^\d+$/, // Just numbers
      /^[a-z\s]+$/i, // Just words without structure
      /(chocolate|vanilla|strawberry|flavor|taste|ingredients|cream|ice|gelato|sorbet|kg|gr|ml|lt)/i, // Food/product terms
      /^\d+\s*(kg|gr|g|ml|l|lt|oz|lb)/i // Measurements
    ];
    
    $(locationSelectors.join(', ')).each((i, el) => {
      const elementText = $(el).text().trim();
      const lines = elementText.split('\n').map(l => l.trim()).filter(l => l.length > 5);
      
      lines.forEach(line => {
        const hasNumber = /\d+/.test(line);
        const hasCommaOrDelimiter = /[,|]/.test(line);
        const addressKeywords = /(av\.|avenue|street|st\.|calle|avenida|ruta|route|camino|paseo|boulevard|blvd)/i;
        
        const isFalsePositive = falsePositivePatterns.some(pattern => pattern.test(line));
        
        if (!isFalsePositive && ((hasNumber && hasCommaOrDelimiter) || addressKeywords.test(line))) {
          if (line.length > 15 && line.length < 150) { // Require longer text for valid addresses
            locationSet.add(line);
          }
        }
      });
    });
    
    // If still no locations, try regex on full body text
    if (locationSet.size === 0) {
      const bodyText = $('body').text();
      const addressPatterns = [
        /(?:Av\.|Avenida|Calle|C\.|Ruta|Paseo|Boulevard)[\s\w.]+\d+[\s\w.,#()-]{5,80}/gi,
        /\d+\s+[\w\s.]+(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Drive|Dr\.|Boulevard|Blvd\.)[,\s]+[\w\s]+,\s*[A-Z]{2}\s+\d{5}/gi,
        /\d+\s+[A-Za-zÀ-ÿ\s.'-]+[,]\s*[A-Za-zÀ-ÿ\s,'-]+/g
      ];
      
      addressPatterns.forEach(pattern => {
        const matches = bodyText.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const cleaned = match.trim();
            if (cleaned.length > 15 && cleaned.length < 150) { // Require longer text
              locationSet.add(cleaned);
            }
          });
        }
      });
    }
  }
  
  const locations = Array.from(locationSet);
  console.log(`[PlaceDetails] Found ${locations.length} locations (before validation):`, locations);
  
  // Filter out false positives with comprehensive validation
  const validLocations = locations.filter(loc => {
    const lower = loc.toLowerCase();
    
    // 1. Filter out business hours patterns (days + times)
    const daysPattern = /(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lun|mar|mié|mie|jue|vie|sáb|sab|dom|mon|tue|wed|thu|fri|sat|sun)/i;
    const timePattern = /(\d{1,2}\s*(?:am|pm|h|hs)|\d{1,2}:\d{2}|\d{1,2}\s*a\s*\d{1,2})/i;
    if (daysPattern.test(lower) && timePattern.test(lower)) {
      return false; // This looks like business hours
    }
    
    // 2. Filter out CSS/JavaScript code patterns
    const codePatterns = [
      /\{[^}]*\}/,  // CSS braces
      /rootmargin/i,
      /px\s+\d+px/,
      /function\s*\(/,
      /class\s*=/,
      /style\s*=/,
      /var\s+/,
      /const\s+/,
      /let\s+/,
      /=>/,
      /\[object/i,
      /undefined/,
      /null\s*;/
    ];
    if (codePatterns.some(pattern => pattern.test(loc))) {
      return false; // This looks like code
    }
    
    // 3. Filter out standalone times without address information
    if (/^\d{1,2}\s*(?:am|pm|h|hs)?\s*a\s*\d{1,2}/i.test(lower) && !/(calle|street|av\.|avenida|boulevard)/i.test(lower)) {
      return false; // Time range without address
    }
    
    // 4. Must have some address-like characteristics (numbers + address words, or commas for city/country)
    const hasNumber = /\d/.test(loc);
    const hasAddressWord = /(calle|street|st\.|av\.|avenue|avenida|boulevard|blvd|road|rd|ruta|camino|plaza|paseo)/i.test(lower);
    const hasComma = /,/.test(loc);
    const hasCity = /(buenos aires|argentina|madrid|barcelona|méxico|mexico|santiago|bogotá|lima|caracas)/i.test(lower);
    
    // Valid location should have either:
    // - Numbers + address word, OR
    // - Numbers + comma (suggests address format), OR
    // - City/country name
    if (!hasNumber && !hasCity) {
      return false; // No numbers and no recognizable city
    }
    
    if (hasNumber && !hasAddressWord && !hasComma && !hasCity) {
      return false; // Has numbers but no address context
    }
    
    return true;
  });
  
  // Remove near-duplicates (same location with minor variations)
  const uniqueLocations = [];
  const seen = new Set();
  
  for (const loc of validLocations) {
    // Normalize for comparison (remove spaces, punctuation, make lowercase)
    const normalized = loc.toLowerCase().replace(/[,.\s]+/g, '');
    
    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueLocations.push(loc);
    }
  }
  
  console.log(`[PlaceDetails] Found ${uniqueLocations.length} valid locations (after filtering):`, uniqueLocations);
  
  // CRITICAL: If we only found 1 location, it's likely just the main business address, not a multi-location business
  // Return 1 location only if we're confident it's a multi-location business (had a locations page)
  if (uniqueLocations.length === 1 && !hasLocationsPage) {
    console.log(`[PlaceDetails] Only found 1 location without a dedicated locations page - likely the main business address. Returning 1 location.`);
    return { numLocations: 1, locationNames: [], hasLocationsPage: false, usedPuppeteer };
  }
  
  return { numLocations: uniqueLocations.length, locationNames: uniqueLocations, hasLocationsPage, usedPuppeteer };
};

// Helper function to find similar business names
export function findSimilarBusinesses(enrichedBusiness, allBusinesses, options = {}) {
  const {
    minSimilarity = 0.8,
    sameCountryOnly = true
  } = options;

  const enrichedName = enrichedBusiness.name.toLowerCase().trim();
  const exactMatches = [];
  const fuzzyMatches = [];

  allBusinesses.forEach(business => {
    // Skip the enriched business itself
    if (business.placeId === enrichedBusiness.placeId) {
      return;
    }

    // Skip already enriched businesses
    if (business.enrichedAt) {
      return;
    }

    // Filter by country if enabled
    if (sameCountryOnly && business.country !== enrichedBusiness.country) {
      return;
    }

    const businessName = business.name.toLowerCase().trim();

    // Check for exact prefix match
    if (businessName.startsWith(enrichedName) || enrichedName.startsWith(businessName)) {
      exactMatches.push({
        business,
        matchType: 'exact_prefix',
        similarity: 1.0
      });
      return;
    }

    // Check for fuzzy match
    const similarity = compareTwoStrings(enrichedName, businessName);
    if (similarity >= minSimilarity) {
      fuzzyMatches.push({
        business,
        matchType: 'fuzzy',
        similarity
      });
    }
  });

  return { exactMatches, fuzzyMatches };
}

// Helper function to clone enrichment data from one business to another
export function cloneEnrichmentData(sourceBusiness, targetBusiness) {
  const clonedData = {
    emails: sourceBusiness.emails || [],
    decisionMakers: sourceBusiness.decisionMakers || [],
    website: sourceBusiness.website,
    phone: sourceBusiness.phone || sourceBusiness.formatted_phone_number,
    category: sourceBusiness.category,
    primaryType: sourceBusiness.primaryType,
    enrichedAt: new Date(),
    websiteAnalysis: sourceBusiness.websiteAnalysis ? {
      hasSEO: sourceBusiness.websiteAnalysis.hasSEO,
      hasWhatsApp: sourceBusiness.websiteAnalysis.hasWhatsApp,
      hasReservation: sourceBusiness.websiteAnalysis.hasReservation,
      hasDirectOrdering: sourceBusiness.websiteAnalysis.hasDirectOrdering,
      hasThirdPartyDelivery: sourceBusiness.websiteAnalysis.hasThirdPartyDelivery,
      analyzedAt: new Date()
    } : null,
    // Note: We do NOT clone numLocations or locationNames as those are location-specific
    clonedFrom: sourceBusiness.placeId,
    clonedAt: new Date()
  };

  console.log(`[Enrichment Clone] Cloning from ${sourceBusiness.name} to ${targetBusiness.name}`);
  console.log(`[Enrichment Clone] Data to clone:`, {
    emails: clonedData.emails.length,
    decisionMakers: clonedData.decisionMakers.length,
    website: clonedData.website,
    category: clonedData.category,
    hasWebsiteAnalysis: !!clonedData.websiteAnalysis
  });

  return clonedData;
}

// Helper function to scrape Linktree pages and extract real website or WhatsApp link
export async function scrapeLinktree(linktreeUrl) {
  try {
    console.log(`[Linktree] Scraping ${linktreeUrl}`);
    
    const response = await fetch(linktreeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!response.ok) {
      console.log(`[Linktree] Failed to fetch: ${response.status}`);
      return { website: null, whatsapp: null };
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    let website = null;
    let whatsapp = null;
    
    // Extract all links from the Linktree page
    const links = [];
    
    // Look for links in common Linktree structures
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim().toLowerCase();
      
      if (href && href.startsWith('http')) {
        links.push({ href, text });
      }
    });
    
    // Also check for data attributes that might contain links
    $('[data-testid="LinkButton"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim().toLowerCase();
      
      if (href && href.startsWith('http')) {
        links.push({ href, text });
      }
    });
    
    console.log(`[Linktree] Found ${links.length} links`);
    
    // Filter out social media and unwanted platforms
    const socialMediaDomains = [
      'instagram.com', 'facebook.com', 'twitter.com', 'tiktok.com', 
      'youtube.com', 'linkedin.com', 'snapchat.com', 'pinterest.com',
      'linktr.ee', 'linktree.com'
    ];
    
    const deliveryPlatforms = [
      'ubereats.com', 'doordash.com', 'grubhub.com', 'rappi.com',
      'pedidosya.com', 'foodpanda.com', 'swiggy.com', 'zomato.com', 'ifood.com'
    ];
    
    // Look for WhatsApp links
    for (const link of links) {
      if (link.href.includes('wa.me') || link.href.includes('whatsapp.com') || 
          link.href.includes('api.whatsapp.com') || link.text.includes('whatsapp') || 
          link.text.includes('ws ')) {
        whatsapp = link.href;
        console.log(`[Linktree] Found WhatsApp link: ${whatsapp}`);
        break;
      }
    }
    
    // Look for a real website (not social media or delivery platforms)
    for (const link of links) {
      const isSocialMedia = socialMediaDomains.some(domain => link.href.includes(domain));
      const isDeliveryPlatform = deliveryPlatforms.some(domain => link.href.includes(domain));
      const isWhatsApp = link.href.includes('wa.me') || link.href.includes('whatsapp');
      
      if (!isSocialMedia && !isDeliveryPlatform && !isWhatsApp) {
        // This might be the real website
        // Prefer links with text like "website", "menu", "sitio", etc.
        const isLikelyWebsite = link.text.includes('website') || link.text.includes('sitio') ||
                                link.text.includes('web') || link.text.includes('menu') ||
                                link.text.includes('página') || link.text.includes('page');
        
        if (isLikelyWebsite || !website) {
          website = link.href;
          console.log(`[Linktree] Found potential website: ${website}`);
          
          if (isLikelyWebsite) {
            break; // Stop if we found a likely website
          }
        }
      }
    }
    
    console.log(`[Linktree] Results - Website: ${website}, WhatsApp: ${whatsapp}`);
    
    return { website, whatsapp };
  } catch (error) {
    console.error(`[Linktree] Error scraping Linktree page:`, error.message);
    return { website: null, whatsapp: null };
  }
} 