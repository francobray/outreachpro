import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

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
        if (['apollo_enrich', 'apollo_people_search', 'apollo_person_match'].includes(call._id)) {
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

// Detect locations from the homepage HTML
export const detectLocations = async (html, baseUrl, options = {}) => {
  const { noPuppeteer = false, debugMode = false } = options;
  let locationSet = new Set();
  let hasLocationsPage = false;
  let usedPuppeteer = false;
  const $ = cheerio.load(html);

  // Try to find a 'locations' page link
  const locationPageKeywords = ['location', 'contact', 'store', 'find-us', 'branches', 'contact-us', 'retail-store-locations'];
  let locationsPageUrl = null;

  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (href) {
      const lowerHref = href.toLowerCase();
      if (locationPageKeywords.some(keyword => lowerHref.includes(keyword))) {
        locationsPageUrl = href;
        return false; // Stop searching once a likely candidate is found
      }
    }
  });

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
      // This regex is more flexible and handles formats with or without commas, and with pipes.
      const addressRegex = /\d+[\w\s.'#()-]+(?:\s*[,|]\s*|\s+)\s*[\w\s.'-]+,?\s*[A-Z]{2}\s+\d{5}/g;
 
      // Strategy 1: Look for common layout patterns like Elementor columns
      $$('.elementor-column, .elementor-widget-wrap, .location, .address-block').each((i, el) => {
        const elementHtml = $$(el).html();
        // Sanitize text by replacing <br> and other tags with spaces
        const elementText = elementHtml.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const matches = elementText.match(addressRegex);
        if (matches) {
          matches.forEach(match => locationSet.add(match));
        }
      });
 
      // Strategy 2: If the structured search fails, fall back to searching the whole body
      if (locationSet.size === 0) {
        console.log(`[PlaceDetails] Structured search failed. Falling back to full-page text search.`);
        const bodyHtml = $$('body').html();
        const bodyText = bodyHtml.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const matches = bodyText.match(addressRegex);
        if (matches) {
          matches.forEach(match => locationSet.add(match));
        }
      }
    } catch (error) {
      console.error(`[PlaceDetails] Error processing locations page ${locationsPageUrl}:`, error);
    }
  } else {
    console.log(`[PlaceDetails] No locations page link found. Analyzing homepage for location details.`);
    const addressRegex = /\d+\s+[a-zA-Z0-9\s]+,\s+[a-zA-Z\s]+,\s*[A-Z]{2}\s+\d{5}/g;
    const bodyText = $('body').text();
    const matches = bodyText.match(addressRegex);
    if (matches) {
      matches.forEach(match => locationSet.add(match));
    }
  }
  
  const locations = Array.from(locationSet);
  console.log(`[PlaceDetails] Found ${locations.length} locations:`, locations);
  return { numLocations: locations.length, locationNames: locations, hasLocationsPage, usedPuppeteer };
}; 