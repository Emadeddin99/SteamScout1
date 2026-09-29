/**
 * Deals API Handler
 * Fetches Steam deals from IsThereAnyDeal (primary) with CheapShark fallback
 * Returns normalized deal objects with consistent shape
 */

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        console.log('[API] Starting deals fetch...');
        
        // Fetch from both sources
        console.log('[API] Fetching from both ITAD and CheapShark...');
        const [itadDeals, cheapsharkDeals] = await Promise.all([
            fetchIsThereAnyDealDeals(),
            fetchCheapSharkDeals()
        ]);
        
        console.log(`[API] ITAD: ${itadDeals.length} deals, CheapShark: ${cheapsharkDeals.length} deals`);
        
        // Combine deals from both sources
        let deals = [...itadDeals, ...cheapsharkDeals];
        console.log(`[API] Combined total: ${deals.length} deals before deduplication`);
        
        // Debug mode: include source counts and small samples when ?debug=1
        const debugMode = req.query && (req.query.debug === '1' || req.query.debug === 'true');
        const debugInfo = {
            itadCount: Array.isArray(itadDeals) ? itadDeals.length : 0,
            cheapsharkCount: Array.isArray(cheapsharkDeals) ? cheapsharkDeals.length : 0,
            itadSample: (Array.isArray(itadDeals) ? itadDeals.slice(0,3) : []),
            cheapsharkSample: (Array.isArray(cheapsharkDeals) ? cheapsharkDeals.slice(0,3) : [])
        };

        // Deduplicate deals by steamAppID, keeping best discount
        deals = deduplicateDeals(deals);
        
        // Filter invalid deals
        deals = filterValidDeals(deals);
        
        // Sort by discount descending, limit to 3000
        deals = deals
            .sort((a, b) => b.discount - a.discount)
            .slice(0, 3000);

        console.log(`[API] ✅ Returning ${deals.length} deals`);

        const responsePayload = {
            success: true,
            count: deals.length,
            deals,
            timestamp: new Date().toISOString()
        };

        if (debugMode) {
            responsePayload.debug = debugInfo;
        }

        res.status(200).json(responsePayload);

    } catch (error) {
        console.error('[API] Fatal error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch deals',
            count: 0,
            deals: []
        });
    }
}

/**
 * Fetch deals from IsThereAnyDeal API (v01 endpoint)
 * @returns {Promise<Array>} Normalized deal objects
 */
async function fetchIsThereAnyDealDeals() {
    try {
        console.log('[API] Fetching from IsThereAnyDeal (v01)...');

        const ITAD_API_KEY = process.env.ITAD_API_KEY;

        if (!ITAD_API_KEY) {
            console.warn('[API] ITAD_API_KEY not configured');
            return [];
        }

        // ITAD v01 endpoint for current deals
        const url = `https://api.isthereanydeal.com/v01/deals/list/?key=${ITAD_API_KEY}&country=US&shops=steam&limit=1500&sort=discount`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'SteamScout/1.0',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[API] ITAD HTTP ${response.status}`);
            console.error(`[API] ITAD error body:`, errorText);
            throw new Error(`ITAD returned ${response.status}`);
        }

        const data = await response.json();
        console.log('[API] ITAD raw response keys:', Object.keys(data).slice(0, 5), '...');
        console.log('[API] ITAD response sample:', JSON.stringify(data).substring(0, 500));

        // Check for API errors
        if (data.error) {
            console.warn(`[API] ITAD error: ${data.error}`);
            return [];
        }

        // v01/deals/list/ returns deals directly in the response
        const dealsList = Array.isArray(data.deals) ? data.deals : (Array.isArray(data) ? data : []);

        if (!Array.isArray(dealsList)) {
            console.warn('[API] Invalid ITAD response format');
            return [];
        }

        console.log(`[API] ITAD returned ${dealsList.length} deals`);

        return dealsList
            .map(deal => normalizeITADDeal(deal))
            .filter(d => d !== null);

    } catch (error) {
        console.error('[API] ITAD fetch error:', error.message);
        return [];
    }
}

/**
 * Normalize ITAD v01 deal to standard shape
 * @param {Object} deal - Raw ITAD deal object
 * @returns {Object|null} Normalized deal or null if invalid
 */
function normalizeITADDeal(deal) {
    try {
        // Extract Steam app ID from ITAD's app_id or id field
        const steamAppID = deal.app_id 
            ? parseInt(deal.app_id) 
            : (deal.app?.id ? parseInt(deal.app.id) : null);
        
        const salePrice = parseFloat(deal.price_new || deal.price) || 0;
        const normalPrice = parseFloat(deal.price_old || deal.regular) || 0;
        
        // Calculate discount percentage
        let discount = 0;
        if (normalPrice > 0) {
            discount = Math.round(((normalPrice - salePrice) / normalPrice) * 100);
        }
        // Use cut field if provided
        if (deal.cut && deal.cut > 0) {
            discount = Math.round(deal.cut);
        }

        // Generate store URL using helper
        const storeUrl = getSteamUrl({ steamAppID, title: deal.title });

        return {
            title: deal.title || 'Unknown Game',
            steamAppID,
            salePrice,
            normalPrice,
            discount,
            expiry: deal.expiry ? parseInt(deal.expiry) : null, // Unix timestamp (seconds) - preserve as-is
            store: 'Steam',
            type: salePrice === 0 ? 'giveaway' : 'sale',
            source: 'itad',
            url: storeUrl
        };
    } catch (error) {
        console.warn('[API] Failed to normalize ITAD deal:', error.message);
        return null;
    }
}

/**
 * Helper function to generate Steam store URLs
 * @param {Object} deal - Deal object with steamAppID and title
 * @returns {string} Steam store URL
 */
function getSteamUrl(deal) {
    // If valid Steam app ID exists, use direct app link
    if (deal.steamAppID && Number(deal.steamAppID) > 0) {
        return `https://store.steampowered.com/app/${deal.steamAppID}`;
    }
    
    // Fallback to Steam search using game title
    if (deal.title) {
        return `https://store.steampowered.com/search/?term=${encodeURIComponent(deal.title)}`;
    }
    
    // Last resort: Steam home page
    return 'https://store.steampowered.com';
}

/**
 * Fetch deals from CheapShark API (fallback)
 * @returns {Promise<Array>} Normalized deal objects
 */
async function fetchCheapSharkDeals() {
    try {
        console.log('[API] Fetching from CheapShark (fallback) with retries...');

        let allDeals = [];
        const pageSize = 100;
        const maxPages = 30; // 30 pages * 100 deals = 3000 deals
        const maxAttemptsPerPage = 3; // retry up to 3 times per page
        const errors = [];
        let attempts = 0;

        // Helper: exponential backoff
        const backoff = async (attempt) => {
            const delay = Math.min(2000 * Math.pow(2, attempt), 15000);
            console.log(`[API] Backoff: waiting ${delay}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, delay));
        };

        for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
            let pageFetched = false;
            let pageData = null;

            for (let attempt = 0; attempt < maxAttemptsPerPage; attempt++) {
                attempts++;
                const url = `https://www.cheapshark.com/api/1.0/deals?storeID=1&pageNumber=${pageNumber}&pageSize=${pageSize}&sortBy=Deal Rating`;

                try {
                    const response = await fetch(url, {
                        headers: {
                            'User-Agent': 'SteamScout/1.0'
                        },
                        // 10s timeout simulated by AbortController if needed in future
                    });

                    if (!response.ok) {
                        errors.push({ page: pageNumber, status: response.status });
                        console.warn(`[API] CheapShark page ${pageNumber} returned ${response.status} (attempt ${attempt + 1})`);

                        if (response.status === 429) {
                            // Rate limited — back off and retry
                            await backoff(attempt);
                            continue;
                        }

                        // For other 4xx/5xx, break and stop paginating
                        break;
                    }

                    pageData = await response.json();

                    if (!Array.isArray(pageData) || pageData.length === 0) {
                        console.log(`[API] CheapShark page ${pageNumber}: No more deals`);
                        pageFetched = false;
                        break; // No more deals to fetch
                    }

                    console.log(`[API] CheapShark page ${pageNumber}: ${pageData.length} deals`);
                    allDeals = allDeals.concat(pageData);
                    pageFetched = true;
                    break;

                } catch (err) {
                    errors.push({ page: pageNumber, error: err.message });
                    console.warn(`[API] CheapShark page ${pageNumber} fetch error (attempt ${attempt + 1}):`, err.message);
                    await backoff(attempt);
                    continue;
                }
            }

            if (!pageFetched) {
                // If first page fails, abort and rely on fallback
                if (pageNumber === 0) {
                    console.warn('[API] CheapShark first page failed after retries; aborting CheapShark fetch');
                    break;
                }
                // Otherwise, stop pagination
                break;
            }

            // small polite delay between successful requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`[API] CheapShark total fetched: ${allDeals.length} deals across all pages (attempts: ${attempts})`);

        try {
            const normalized = allDeals
                .map((deal, idx) => {
                    try {
                        const result = normalizeCheapSharkDeal(deal);
                        if (!result) {
                            console.log(`[API]   Deal ${idx}: Skipped "${deal.title}" (storeID: ${deal.storeID})`);
                        }
                        return result;
                    } catch (err) {
                        console.error(`[API]   Deal ${idx}: Error normalizing:`, err.message);
                        return null;
                    }
                })
                .filter(d => d !== null);

            console.log(`[API] CheapShark normalized: ${normalized.length} valid deals`);

            // If nothing was fetched from CheapShark, fall back to local sample file
            if (normalized.length === 0) {
                try {
                    console.warn('[API] CheapShark returned no deals; attempting to load local sample fallback');
                    const fs = require('fs');
                    const path = require('path');
                    const samplePath = path.resolve(__dirname, '../assets/sample-deals.json');
                    const sampleRaw = fs.readFileSync(samplePath, 'utf-8');
                    const sample = JSON.parse(sampleRaw);
                    console.log(`[API] Loaded ${sample.length} deals from local sample fallback`);
                    return sample;
                } catch (err) {
                    console.error('[API] Failed to load local sample fallback:', err.message);
                    return [];
                }
            }

            return normalized;
        } catch (err) {
            console.error('[API] Error during CheapShark mapping:', err.message);
            return [];
        }

    } catch (error) {
        console.error('[API] CheapShark fetch error:', error.message);
        return [];
    }
}

/**
 * Normalize CheapShark deal to standard shape
 * @param {Object} deal - Raw CheapShark deal object
 * @returns {Object|null} Normalized deal or null if invalid
 */
function normalizeCheapSharkDeal(deal) {
    try {
        // Note: CheapShark is now filtered to Steam only via the API request (storeID=1)
        const steamAppID = deal.steamAppID ? parseInt(deal.steamAppID) : null;
        const salePrice = parseFloat(deal.salePrice) || 0;
        const normalPrice = parseFloat(deal.normalPrice) || 0;
        const discount = Math.round(parseFloat(deal.savings)) || 0;

        // CheapShark doesn't provide expiry, so estimate based on discount % and freshness
        // Logic: Higher discounts are less common and may expire sooner
        //        but we default to 7-14 days depending on discount
        let expiryDays = 7; // Default 7 days
        
        if (discount >= 80) {
            expiryDays = 5; // Steep discounts likely to expire faster
        } else if (discount >= 60) {
            expiryDays = 7;
        } else if (discount >= 30) {
            expiryDays = 10;
        } else {
            expiryDays = 14; // Small discounts likely last longer
        }
        
        // Convert to Unix seconds
        const expirySeconds = Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60);
        const expiry = deal.dealExpires ? parseInt(deal.dealExpires) : expirySeconds;

        // Generate store URL using helper
        const storeUrl = getSteamUrl({ steamAppID, title: deal.title });

        return {
            title: deal.title || 'Unknown Game',
            steamAppID,
            salePrice,
            normalPrice,
            discount,
            expiry, // Keep as Unix seconds
            store: 'Steam',
            type: salePrice === 0 ? 'giveaway' : 'sale',
            source: 'cheapshark',
            url: storeUrl
        };
    } catch (error) {
        console.warn('[API] Failed to normalize CheapShark deal:', error.message);
        return null;
    }
}

/**
 * Remove duplicate deals, keeping the best discount per steamAppID
 * @param {Array} deals - Array of normalized deals
 * @returns {Array} Deduplicated deals
 */
function deduplicateDeals(deals) {
    const map = new Map();
    let skipped = 0;

    for (const deal of deals) {
        if (!deal.steamAppID) {
            console.warn(`[API] Skipping deal without steamAppID: "${deal.title}"`);
            skipped++;
            continue; // Skip deals without Steam ID
        }

        const key = deal.steamAppID;
        const existing = map.get(key);

        if (!existing || deal.discount > existing.discount) {
            map.set(key, deal);
        }
    }

    console.log(`[API] Deduplicated: ${deals.length} deals (${skipped} skipped) → ${map.size} unique deals`);
    return Array.from(map.values());
}

/**
 * Filter invalid deals
 * Removes deals where:
 * - salePrice >= normalPrice (no real discount)
 * - discount <= 0 (no discount)
 * - missing required fields
 * @param {Array} deals - Array of normalized deals
 * @returns {Array} Filtered deals
 */
function filterValidDeals(deals) {
    return deals.filter(d => {
        // Must have a discount
        if (d.discount <= 0) return false;

        // Sale price must be less than normal price
        if (d.salePrice >= d.normalPrice) return false;

        // Must have title and Steam ID
        if (!d.title || !d.steamAppID) return false;

        // Expiry must be valid if present (positive Unix timestamp)
        if (d.expiry && d.expiry <= 0) return false;

        return true;
    });
}
