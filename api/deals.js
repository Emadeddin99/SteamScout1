const DEALS_PER_PAGE = 21;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const requestedPage = Number.parseInt(req.query?.page, 10) || 1;
    const page = Math.max(1, requestedPage);
    const requestedPageSize = Number.parseInt(req.query?.limit, 10) || DEALS_PER_PAGE;
    const pageSize = Math.max(1, Math.min(DEALS_PER_PAGE, requestedPageSize));
    const sort = ['deal', 'discount', 'price'].includes(req.query?.sort)
        ? req.query.sort
        : 'discount';

    try {
        let pageResult = await fetchIsThereAnyDealDealsPage(page, sort, pageSize);
        let source = 'itad';

        if (!pageResult) {
            pageResult = await fetchCheapSharkDealsPage(page, sort, pageSize);
            source = 'cheapshark';
        }

        res.status(200).json({
            success: true,
            page,
            pageSize,
            count: pageResult.deals.length,
            hasMore: pageResult.hasMore,
            source,
            deals: pageResult.deals,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[API] Deals page fetch failed:', error);
        res.status(502).json({
            success: false,
            error: 'Unable to load this page. Please try again.',
            page,
            pageSize,
            deals: []
        });
    }
}

async function fetchIsThereAnyDealDealsPage(page, sort, pageSize) {
    const apiKey = process.env.ITAD_API_KEY;
    if (!apiKey) return null;

    try {
        const params = new URLSearchParams({
            country: 'US',
            offset: String((page - 1) * pageSize),
            limit: String(pageSize),
            sort: sort === 'price' ? 'price' : '-cut',
            shops: '61'
        });
        const response = await fetch(`https://api.isthereanydeal.com/deals/v2?${params}`, {
            headers: {
                'ITAD-API-Key': apiKey,
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            console.warn(`[API] ITAD returned ${response.status}; using CheapShark fallback`);
            return null;
        }

        const data = await response.json();
        if (!Array.isArray(data.list)) return null;

        const deals = deduplicatePagedDeals(data.list
            .map(normalizeITADDeal)
            .filter(deal => deal && deal.discount > 0 && deal.salePrice < deal.normalPrice));

        return { deals, hasMore: Boolean(data.hasMore) };
    } catch (error) {
        console.warn('[API] ITAD fetch error; using CheapShark fallback:', error.message);
        return null;
    }
}

function normalizeITADDeal(deal) {
    try {
        const sourceDeal = deal.deal;
        if (!sourceDeal) return null;

        const steamAppID = Number.parseInt(deal.appid || deal.app?.id, 10) || null;
        const steamGameId = deal.id || String(steamAppID || deal.title || '');
        const salePrice = Number(sourceDeal.price?.amount) || 0;
        const normalPrice = Number(sourceDeal.regular?.amount) || 0;

        return {
            title: deal.title || 'Unknown Game',
            steamAppID,
            steamGameId,
            salePrice,
            normalPrice,
            discount: Number(sourceDeal.cut) || 0,
            expiry: sourceDeal.expiry ? Math.floor(Date.parse(sourceDeal.expiry) / 1000) : null,
            store: sourceDeal.shop?.name || 'Steam',
            type: salePrice === 0 ? 'giveaway' : 'sale',
            source: 'itad',
            url: sourceDeal.url || getSteamUrl({ steamAppID, title: deal.title })
        };
    } catch (error) {
        console.warn('[API] Failed to normalize ITAD deal:', error.message);
        return null;
    }
}

function deduplicatePagedDeals(deals) {
    const seen = new Set();
    return deals.filter(deal => {
        const key = deal.steamAppID
            ? `steam:${deal.steamAppID}`
            : `itad:${deal.steamGameId || deal.title.trim().toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
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
async function fetchCheapSharkDealsPage(page, sort, pageSize) {
    try {
        const sortBy = sort === 'price' ? 'Price' : sort === 'discount' ? 'Savings' : 'Deal Rating';
        const params = new URLSearchParams({
            storeID: '1',
            pageNumber: String(page - 1),
            pageSize: String(pageSize),
            sortBy
        });
        const response = await fetch(`https://www.cheapshark.com/api/1.0/deals?${params}`, {
            headers: { 'User-Agent': 'SteamScout/1.0' }
        });

        if (!response.ok) {
            const errorBody = await response.text();
            if (response.status === 400 && /Too Many Results/i.test(errorBody)) {
                return { deals: [], hasMore: false };
            }
            throw new Error(`CheapShark returned ${response.status}`);
        }

        const rawDeals = await response.json();
        const deals = deduplicateDeals((Array.isArray(rawDeals) ? rawDeals : [])
            .map(normalizeCheapSharkDeal)
            .filter(Boolean));

        return {
            deals: filterValidDeals(deals),
            hasMore: Array.isArray(rawDeals) && rawDeals.length === pageSize
        };
    } catch (error) {
        console.error('[API] CheapShark fallback failed:', error.message);
        throw error;
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
