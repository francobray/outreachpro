# ICP Website Analysis Feature

## Overview

This feature automatically detects and persists ICP (Ideal Customer Profile) variables when enriching business data from websites. The analysis is reused across enrichment and ICP calculation to prevent code duplication.

## What's Analyzed

The system analyzes websites for the following ICP variables with **multilingual support** (English, Spanish, Italian, Portuguese):

### 1. **SEO/AEO Practices** (`hasSEO`)
Checks for:
- Title tag presence
- Meta description
- H1 heading
- Structured data (JSON-LD)

Score: Good SEO = 3+ criteria met

### 2. **WhatsApp Contact** (`hasWhatsApp`)
Detects WhatsApp links and references:
- `wa.me` links
- `api.whatsapp.com`
- "whatsapp" keyword in links

### 3. **Reservation CTA** (`hasReservation`)
Identifies reservation systems in multiple languages:
- **English**: "reservation", "reserve", "book a table", "book now"
- **Spanish**: "reserva", "reservas", "reservar", "hacer reserva"
- **Italian**: "prenotazione", "prenota", "prenotare"
- **Portuguese**: "reserva", "reservar", "fazer reserva"
- **Platforms**: OpenTable, Resy, Tock, PastaRossa Online

### 4. **Third-Party Delivery** (`hasThirdPartyDelivery`)
Detects delivery platform integrations globally:
- **North America**: UberEats, DoorDash, Grubhub, Postmates, Seamless
- **Europe**: Deliveroo, Just Eat, Glovo
- **Latin America**: Rappi, PedidosYa, iFood
- **Asia**: FoodPanda, Grab

### 5. **Direct Ordering** (`hasDirectOrdering`)
Identifies native ordering systems in multiple languages:
- **English**: "order online", "order now", "add to cart", "checkout"
- **Spanish**: "pedir online", "pedir ahora", "ordenar", "añadir al carrito", "para llevar", "takeaway"
- **Italian**: "ordina online", "ordina ora", "aggiungi al carrello", "asporto"
- **Portuguese**: "pedir online", "fazer pedido", "adicionar ao carrinho"
- Detects menu/cart UI elements and buttons

## Implementation Details

### New Function: `analyzeWebsiteForICP()`

**Location:** `server/utils.js`

**Parameters:**
- `html` - Homepage HTML content
- `website` - Base URL

**Returns:** Object with analysis results
```javascript
{
  hasSEO: boolean | null,
  hasWhatsApp: boolean | null,
  hasReservation: boolean | null,
  hasDirectOrdering: boolean | null,
  hasThirdPartyDelivery: boolean | null,
  analyzedAt: Date
}
```

### Integration Points

#### 1. **Enrichment Process** (`enrichBusinessData()`)
- Runs automatically when enriching any business
- Analyzes homepage HTML after fetching
- Persists results to `business.websiteAnalysis`
- Logs all findings for debugging

#### 2. **ICP Score Calculation** (`POST /api/icp-score/:businessId`)
- Checks if analysis exists and is recent (< 30 days)
- Automatically re-analyzes if missing or outdated
- Reuses existing analysis if available
- Falls back gracefully if analysis fails

#### 3. **Database Storage**
**Model:** `Business.js`

**Field:** `websiteAnalysis`
```javascript
{
  hasSEO: { type: Boolean, default: null },
  hasWhatsApp: { type: Boolean, default: null },
  hasReservation: { type: Boolean, default: null },
  hasDirectOrdering: { type: Boolean, default: null },
  hasThirdPartyDelivery: { type: Boolean, default: null },
  analyzedAt: { type: Date, default: null }
}
```

## Usage

### Automatic Enrichment
When you enrich a business with website data:
```javascript
// Triggered by "Enrich" button in UI
POST /api/place-details/:placeId
```

The system will:
1. Fetch the website HTML
2. Analyze for ICP variables
3. Save results to database
4. Use for future ICP calculations

### Manual ICP Calculation
When you calculate ICP scores:
```javascript
// Triggered by "Calculate ICP" button
POST /api/icp-score/:businessId
```

The system will:
1. Check if website analysis exists
2. Re-analyze if missing/outdated (> 30 days)
3. Calculate ICP score using analysis data
4. Save both analysis and score

## Benefits

1. **No Code Duplication**: Single function used across enrichment and ICP calculation
2. **Automatic Detection**: All ICP variables detected during enrichment
3. **Cached Results**: Analysis persisted to avoid re-scraping
4. **Smart Refresh**: Automatically re-analyzes after 30 days
5. **Graceful Fallback**: Continues with partial data if analysis fails
6. **Comprehensive Logging**: All analysis results logged for debugging

## Example Flow

```
1. User searches for "restaurants in Miami"
   → Business records created in DB

2. User clicks "Enrich" on a business
   → Website HTML fetched
   → analyzeWebsiteForICP() runs
   → Results saved to business.websiteAnalysis
   → Emails and locations also extracted

3. User clicks "Calculate ICP"
   → Checks business.websiteAnalysis
   → If exists and recent → use cached data
   → If missing/old → re-analyze website
   → Calculate score using all ICP variables
   → Save score to business.icpScores
```

## Monitoring

All analysis steps are logged with prefix `[Website Analysis]`:

```
[Website Analysis] Starting analysis for https://example.com
[Website Analysis]   SEO: true (score: 4/4)
[Website Analysis]   WhatsApp: true
[Website Analysis]   Reservation: true
[Website Analysis]   Third Party Delivery: false
[Website Analysis]   Direct Ordering: true
[Website Analysis] Completed analysis for https://example.com
```

## Multilingual Support

The system detects keywords in **4 languages**:
- 🇺🇸 **English**: Primary market (US, UK, Canada, Australia)
- 🇪🇸 **Spanish**: Latin America (Argentina, Mexico, Colombia, etc.) and Spain
- 🇮🇹 **Italian**: Italy and Italian restaurants worldwide
- 🇧🇷 **Portuguese**: Brazil and Portugal

### Regional Platform Detection

The system also recognizes regional delivery platforms:
- **North America**: UberEats, DoorDash, Grubhub, Postmates, Seamless
- **Latin America**: Rappi, PedidosYa (Argentina, Uruguay, Chile, etc.), iFood (Brazil)
- **Europe**: Deliveroo, Just Eat, Glovo
- **Asia**: FoodPanda, Grab

### Why Multilingual?

Many businesses operate in non-English markets. Examples:
- **La Parolaccia** (Argentina): Uses "RESERVAS", "TAKEAWAY", works with Rappi and PedidosYa
- **Italian Restaurants**: Often use Italian terms like "prenotazione" and "asporto"
- **Brazilian Restaurants**: Use Portuguese terms like "fazer pedido" and platforms like iFood

## Future Enhancements

Potential improvements:
- Add more languages (French, German, Chinese, Japanese)
- Add more ICP variables (social media presence, reviews, etc.)
- Machine learning for better pattern detection
- Multi-page analysis (not just homepage)
- Competitor analysis
- Industry-specific checks
- Regional dialects and variations

