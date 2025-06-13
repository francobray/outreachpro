import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

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

// API Routes

// Search businesses using Google Places API (mocked)
app.post('/api/search', (req, res) => {
  const { location, keyword } = req.body;
  
  // Simulate API delay
  setTimeout(() => {
    // Always return ALL sample data regardless of search input
    let results = [];
    
    // Add all predefined businesses from all categories and locations
    Object.values(mockPlacesData).forEach(categoryBusinesses => {
      results = results.concat(categoryBusinesses);
    });
    
    // Add some additional generated businesses for variety
    const additionalBusinesses = generateMockBusinesses(keyword, location);
    results = results.concat(additionalBusinesses);
    
    // Add to businesses storage if not already exists
    results.forEach(business => {
      const exists = businesses.find(b => b.placeId === business.placeId);
      if (!exists) {
        businesses.push({
          ...business,
          emails: [],
          auditReport: null,
          emailStatus: 'pending',
          addedAt: new Date().toISOString()
        });
      }
    });
    
    res.json({ businesses: results });
  }, 1000);
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
app.post('/api/emails/:businessId', (req, res) => {
  const { businessId } = req.params;
  const business = businesses.find(b => b.id === businessId);
  
  if (!business) {
    return res.status(404).json({ error: 'Business not found' });
  }
  
  // Simulate API delay
  setTimeout(() => {
    const businessDomain = business.website ? 
      business.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : 
      business.name.toLowerCase().replace(/\s+/g, '') + '.com';
    
    const emails = [
      `info@${businessDomain}`,
      `contact@${businessDomain}`,
      `owner@${businessDomain}`
    ].slice(0, Math.floor(Math.random() * 2) + 1);
    
    // Update business with emails
    business.emails = emails;
    
    res.json({ emails });
  }, 1500);
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});