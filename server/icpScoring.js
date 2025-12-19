/**
 * ICP (Ideal Customer Profile) Scoring System
 * Calculates fit score (0-100%) based on configurable factors
 */

/**
 * Calculate ICP score for a business based on configuration
 * Score is from 0-10 based on weighted factors
 * @param {Object} business - Business data
 * @param {Object} config - ICP configuration
 * @returns {Object} - Score and breakdown
 */
export function calculateICPScore(business, config) {
  if (!config || !business) {
    console.log('[ICP Scoring] Missing config or business data');
    return { score: null, breakdown: {} };
  }

  console.log(`[ICP Scoring] Starting calculation for ${business.name} with ${config.name} profile`);
  
  const factors = config.factors;
  const breakdown = {};
  let totalScore = 0;

  // Factor 1: Number of Locations
  if (factors.numLocations.enabled) {
    const locationScorePercent = calculateLocationScore(
      business.numLocations,
      factors.numLocations.minIdeal,
      factors.numLocations.maxIdeal,
      config.type
    );
    const contributionScore = (locationScorePercent / 100) * factors.numLocations.weight;
    breakdown.numLocations = {
      scorePercent: locationScorePercent,
      weight: factors.numLocations.weight,
      contribution: contributionScore,
      value: business.numLocations
    };
    totalScore += contributionScore;
    console.log(`[ICP Scoring]   numLocations: ${business.numLocations} → ${locationScorePercent}% → +${contributionScore.toFixed(2)}`);
  }

  // Factor 2: No Website (for independent restaurants only)
  if (factors.noWebsite.enabled && config.type === 'independent') {
    const noWebsiteScorePercent = !business.website ? 100 : 0;
    const contributionScore = (noWebsiteScorePercent / 100) * factors.noWebsite.weight;
    breakdown.noWebsite = {
      scorePercent: noWebsiteScorePercent,
      weight: factors.noWebsite.weight,
      contribution: contributionScore,
      value: !business.website
    };
    totalScore += contributionScore;
  }

  // Factor 3: Good SEO/AEO practices (rewards businesses with good SEO)
  if (factors.poorSEO.enabled && business.websiteAnalysis) {
    const seoScorePercent = business.websiteAnalysis.hasSEO === true ? 100 : 
                            business.websiteAnalysis.hasSEO === false ? 0 : 50;
    const contributionScore = (seoScorePercent / 100) * factors.poorSEO.weight;
    breakdown.poorSEO = {
      scorePercent: seoScorePercent,
      weight: factors.poorSEO.weight,
      contribution: contributionScore,
      value: business.websiteAnalysis.hasSEO
    };
    totalScore += contributionScore;
  }

  // Factor 4: Has WhatsApp
  if (factors.hasWhatsApp.enabled && business.websiteAnalysis) {
    const whatsappScorePercent = business.websiteAnalysis.hasWhatsApp === true ? 100 : 0;
    const contributionScore = (whatsappScorePercent / 100) * factors.hasWhatsApp.weight;
    breakdown.hasWhatsApp = {
      scorePercent: whatsappScorePercent,
      weight: factors.hasWhatsApp.weight,
      contribution: contributionScore,
      value: business.websiteAnalysis.hasWhatsApp
    };
    totalScore += contributionScore;
  }

  // Factor 5: Has Reservation CTA
  if (factors.hasReservation.enabled && business.websiteAnalysis) {
    const reservationScorePercent = business.websiteAnalysis.hasReservation === true ? 100 : 0;
    const contributionScore = (reservationScorePercent / 100) * factors.hasReservation.weight;
    breakdown.hasReservation = {
      scorePercent: reservationScorePercent,
      weight: factors.hasReservation.weight,
      contribution: contributionScore,
      value: business.websiteAnalysis.hasReservation
    };
    totalScore += contributionScore;
  }

  // Factor 6: Has Direct Ordering (prefers direct, but accepts both)
  if (factors.hasDirectOrdering.enabled && business.websiteAnalysis) {
    // Give full points if they have direct ordering, regardless of third-party
    // Having both is good - it shows they have their own ordering system
    const directOrderScorePercent = business.websiteAnalysis.hasDirectOrdering === true ? 100 : 0;
    const contributionScore = (directOrderScorePercent / 100) * factors.hasDirectOrdering.weight;
    breakdown.hasDirectOrdering = {
      scorePercent: directOrderScorePercent,
      weight: factors.hasDirectOrdering.weight,
      contribution: contributionScore,
      value: {
        hasDirectOrdering: business.websiteAnalysis.hasDirectOrdering,
        hasThirdPartyDelivery: business.websiteAnalysis.hasThirdPartyDelivery
      }
    };
    totalScore += contributionScore;
  }

  // Factor 7: Geography (target countries)
  if (factors.geography && factors.geography.enabled) {
    const geographyScorePercent = isBusinessInTargetCountry(business, config.targetCountries || []) ? 100 : 0;
    const contributionScore = (geographyScorePercent / 100) * factors.geography.weight;
    breakdown.geography = {
      scorePercent: geographyScorePercent,
      weight: factors.geography.weight,
      contribution: contributionScore,
      value: business.country
    };
    totalScore += contributionScore;
    console.log(`[ICP Scoring]   geography: ${business.country} in [${config.targetCountries}] → ${geographyScorePercent}% → +${contributionScore.toFixed(2)}`);
  }

  // Factor 8: Delivery Intensive Category
  if (factors.deliveryIntensiveCategory.enabled) {
    const categoryScore = calculateDeliveryCategoryScore(business);
    const categoryType = getDeliveryCategoryType(business);
    const contributionScore = (categoryScore / 100) * factors.deliveryIntensiveCategory.weight;
    breakdown.deliveryIntensiveCategory = {
      scorePercent: categoryScore,
      weight: factors.deliveryIntensiveCategory.weight,
      contribution: contributionScore,
      value: categoryType
    };
    totalScore += contributionScore;
    console.log(`[ICP Scoring]   deliveryCategory: ${categoryType} (${business.category}) → ${categoryScore}% → +${contributionScore.toFixed(2)}`);
  }

  // Factor 9: Booking Intensive Category
  if (factors.bookingIntensiveCategory.enabled) {
    const bookingScore = calculateBookingCategoryScore(business);
    const bookingType = getBookingCategoryType(business);
    const contributionScore = (bookingScore / 100) * factors.bookingIntensiveCategory.weight;
    breakdown.bookingIntensiveCategory = {
      scorePercent: bookingScore,
      weight: factors.bookingIntensiveCategory.weight,
      contribution: contributionScore,
      value: bookingType
    };
    totalScore += contributionScore;
    console.log(`[ICP Scoring]   bookingCategory: ${bookingType} (${business.category}) → ${bookingScore}% → +${contributionScore.toFixed(2)}`);
  }

  // Final score is 0-10 based on weighted contributions
  const finalScore = Math.round(totalScore * 10) / 10; // Round to 1 decimal place

  console.log(`[ICP Scoring] Final score: ${finalScore}/10 (Total: ${totalScore.toFixed(2)})`);
  console.log(`[ICP Scoring] Factors breakdown:`, Object.keys(breakdown).map(key => 
    `${key}: ${breakdown[key].contribution.toFixed(2)}`
  ).join(', '));

  return {
    score: finalScore,
    breakdown,
    maxScore: 10,
    calculatedAt: new Date()
  };
}

/**
 * Calculate score based on number of locations
 */
function calculateLocationScore(numLocations, minIdeal, maxIdeal, icpType) {
  if (!numLocations || numLocations < 1) {
    return 0;
  }

  if (icpType === 'midmarket') {
    // MidMarket: ideal is 10 or more
    if (numLocations >= minIdeal) {
      return 100;
    } else if (numLocations >= minIdeal / 2) {
      // Partial score for 5-9 locations
      return Math.round((numLocations / minIdeal) * 100);
    } else {
      return Math.round((numLocations / minIdeal) * 50);
    }
  } else if (icpType === 'independent') {
    // Independent: ideal is 2-9 locations
    if (numLocations >= minIdeal && numLocations <= maxIdeal) {
      return 100;
    } else if (numLocations === 1) {
      return 70; // Still acceptable
    } else if (numLocations > maxIdeal) {
      // Penalty for too many locations
      return Math.max(0, 100 - ((numLocations - maxIdeal) * 10));
    } else {
      return 30;
    }
  }

  return 50;
}

/**
 * Check if business is in target country based on country field, address, or location names
 */
function isBusinessInTargetCountry(business, targetCountries) {
  if (!targetCountries || targetCountries.length === 0) {
    return false;
  }

  // Check business.country field
  if (business.country && targetCountries.includes(business.country)) {
    return true;
  }

  // Check address for country indicators
  if (business.address) {
    const address = business.address.toLowerCase();
    return targetCountries.some(country => {
      return address.includes(country.toLowerCase());
    });
  }

  // Check location names
  if (business.locationNames && business.locationNames.length > 0) {
    return business.locationNames.some(loc => {
      const location = loc.toLowerCase();
      return targetCountries.some(country => location.includes(country.toLowerCase()));
    });
  }

  return false;
}

/**
 * Delivery intensive categories
 */
const DELIVERY_INTENSIVE_CATEGORIES = [
  'pizza',
  'hamburguesas',
  'sushi',
  'comida mexicana',
  'comida healthy',
  'milanesas',
  'empanadas'
];

/**
 * Moderate delivery categories (Bar/Fine dining/Coffee)
 */
const MODERATE_DELIVERY_CATEGORIES = [
  'bar',
  'fine dining',
  'coffee',
  'café',
  'coffee shop',
  'cafetería'
];

/**
 * Booking intensive categories
 */
const BOOKING_INTENSIVE_CATEGORIES = [
  'bar',
  'craft beer',
  'cerveza artesanal',
  'fine dining',
  'restaurante gourmet'
];

/**
 * Coffee/Ice cream categories (no booking)
 */
const NO_BOOKING_CATEGORIES = [
  'coffee',
  'café',
  'coffee shop',
  'cafetería',
  'ice cream',
  'heladería',
  'gelato'
];

/**
 * Get business categories from various fields
 */
function getBusinessCategories(business) {
  const businessCategories = [];
  
  if (business.category) {
    businessCategories.push(business.category.toLowerCase());
  }
  
  if (business.types) {
    businessCategories.push(...business.types.map(t => t.toLowerCase()));
  }

  return businessCategories;
}

/**
 * Get delivery category type for a business
 */
function getDeliveryCategoryType(business) {
  const businessCategories = getBusinessCategories(business);
  
  if (businessCategories.length === 0) {
    return 'unknown';
  }

  // Check for delivery intensive
  const isDeliveryIntensive = businessCategories.some(cat => 
    DELIVERY_INTENSIVE_CATEGORIES.some(deliveryCat => 
      cat.includes(deliveryCat) || deliveryCat.includes(cat)
    )
  );

  if (isDeliveryIntensive) {
    return 'delivery-intensive';
  }

  // Check for moderate categories
  const isModerate = businessCategories.some(cat => 
    MODERATE_DELIVERY_CATEGORIES.some(modCat => 
      cat.includes(modCat) || modCat.includes(cat)
    )
  );

  if (isModerate) {
    return 'moderate';
  }

  return 'other';
}

/**
 * Calculate category score based on delivery intensity
 * Returns: 100 for delivery-intensive, 33.33 for moderate, 0 for other
 */
function calculateDeliveryCategoryScore(business) {
  const categoryType = getDeliveryCategoryType(business);
  
  if (categoryType === 'delivery-intensive') {
    return 100; // Will contribute full weight (3)
  } else if (categoryType === 'moderate') {
    return 33.33; // Will contribute 1/3 of weight (1 if weight is 3)
  } else {
    return 0; // Will contribute 0
  }
}

/**
 * Get booking category type for a business
 */
function getBookingCategoryType(business) {
  const businessCategories = getBusinessCategories(business);
  
  if (businessCategories.length === 0) {
    return 'unknown';
  }

  // Check for no-booking categories first (Coffee/Ice cream)
  const isNoBooking = businessCategories.some(cat => 
    NO_BOOKING_CATEGORIES.some(noBookCat => 
      cat.includes(noBookCat) || noBookCat.includes(cat)
    )
  );

  if (isNoBooking) {
    return 'no-booking';
  }

  // Check for booking intensive
  const isBookingIntensive = businessCategories.some(cat => 
    BOOKING_INTENSIVE_CATEGORIES.some(bookingCat => 
      cat.includes(bookingCat) || bookingCat.includes(cat)
    )
  );

  if (isBookingIntensive) {
    return 'booking-intensive';
  }

  return 'other';
}

/**
 * Calculate booking category score
 * Returns: 100 for booking-intensive, 0 for coffee/ice cream, 50 for other
 */
function calculateBookingCategoryScore(business) {
  const categoryType = getBookingCategoryType(business);
  
  if (categoryType === 'booking-intensive') {
    return 100; // Will contribute full weight (2)
  } else if (categoryType === 'no-booking') {
    return 0; // Will contribute 0
  } else {
    return 50; // Will contribute half weight (1 if weight is 2)
  }
}

/**
 * Get default ICP configurations
 */
export function getDefaultICPConfigs() {
  return [
    {
      name: 'MidMarket Brands',
      type: 'midmarket',
      factors: {
        numLocations: {
          enabled: true,
          weight: 1,
          minIdeal: 10,
          maxIdeal: null
        },
        poorSEO: {
          enabled: true,
          weight: 1
        },
        hasWhatsApp: {
          enabled: true,
          weight: 1
        },
        hasReservation: {
          enabled: true,
          weight: 1
        },
        hasDirectOrdering: {
          enabled: true,
          weight: 1
        },
        geography: {
          enabled: true,
          weight: 1
        },
        noWebsite: {
          enabled: false,
          weight: 0
        },
        deliveryIntensiveCategory: {
          enabled: true,
          weight: 2
        },
        bookingIntensiveCategory: {
          enabled: true,
          weight: 2
        }
      },
      deliveryCategories: ['Pizza', 'Hamburguesas', 'Sushi', 'Comida Mexicana', 'Comida Healthy', 'Milanesas', 'Empanadas'],
      bookingCategories: ['Bar', 'Craft Beer', 'Fine Dining'],
      targetCountries: ['Argentina']
    },
    {
      name: 'Independent Restaurants',
      type: 'independent',
      factors: {
        numLocations: {
          enabled: true,
          weight: 1,
          minIdeal: 2,
          maxIdeal: 9
        },
        noWebsite: {
          enabled: true,
          weight: 1
        },
        poorSEO: {
          enabled: true,
          weight: 1
        },
        hasWhatsApp: {
          enabled: true,
          weight: 1
        },
        hasReservation: {
          enabled: true,
          weight: 1
        },
        hasDirectOrdering: {
          enabled: true,
          weight: 1
        },
        geography: {
          enabled: true,
          weight: 1
        },
        deliveryIntensiveCategory: {
          enabled: true,
          weight: 1
        },
        bookingIntensiveCategory: {
          enabled: true,
          weight: 2
        }
      },
      deliveryCategories: ['Pizza', 'Hamburguesas', 'Sushi', 'Comida Mexicana', 'Comida Healthy', 'Milanesas', 'Empanadas'],
      bookingCategories: ['Bar', 'Craft Beer', 'Fine Dining'],
      targetCountries: ['Argentina']
    }
  ];
}

