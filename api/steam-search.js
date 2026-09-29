/**
 * Steam Search API Handler
 * Searches for games on Steam directly from server (no CORS needed)
 * Server-side requests work with Steam API unlike browser requests
 */

const MAX_RETRIES = 2;
const RETRY_DELAY = 500; // ms

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
        const { gameName } = req.query;

        if (!gameName) {
            return res.status(400).json({ error: 'Missing gameName parameter' });
        }

        console.log(`[API] Searching Steam for: ${gameName}`);

        // Call Steam search directly from server (works without CORS proxy)
        const steamSearchUrl = `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(gameName)}`;
        
        console.log(`[API] Fetching from: ${steamSearchUrl}`);
        
        const searchResponse = await fetch(steamSearchUrl, {
            headers: {
                'User-Agent': 'SteamScout/1.0'
            }
        });

        if (!searchResponse.ok) {
            console.error(`[API] Steam search returned status ${searchResponse.status}`);
            return res.status(400).json({
                error: `Steam API returned ${searchResponse.status}`,
                appId: null,
                prices: []
            });
        }

        const searchData = await searchResponse.json();

        if (!searchData || searchData.length === 0) {
            console.log(`[API] No Steam results found for: ${gameName}`);
            return res.status(404).json({
                error: 'Game not found on Steam',
                appId: null,
                prices: []
            });
        }

        // Find best match from search results
        // Score each result and pick the best one
        const gameNameLower = gameName.toLowerCase();
        let bestMatch = searchData[0];
        let bestScore = 0;

        // Extract year if present in search query
        const yearMatch = gameName.match(/\((\d{4})\)/);
        const searchYear = yearMatch ? yearMatch[1] : null;
        const baseGameName = gameName.split('(')[0].trim().toLowerCase();

        console.log(`[API] Searching for: "${gameName}", base: "${baseGameName}", year: ${searchYear}`);

        for (const result of searchData.slice(0, 15)) {
            const titleLower = result.name.toLowerCase();
            let score = 0;

            // Penalize sequel titles if we're not searching for sequels
            const isSequel = /ragnar|remaster|remake|director'?s cut|edition|deluxe|goty|complete/.test(titleLower);
            const wantSequel = /ragnar|remaster|remake|director'?s cut|edition|deluxe|goty|complete/.test(gameNameLower);
            
            if (isSequel && !wantSequel) {
                score = -100; // Penalize sequels
            }

            // Exact match gets highest score
            if (titleLower === gameNameLower) {
                score = 1000;
            }
            // If year specified, prioritize results with that year
            else if (searchYear && titleLower.includes(searchYear)) {
                score = 800;
            }
            // Starts with base game name
            else if (titleLower.startsWith(baseGameName)) {
                score = 500;
            }
            // Contains base game name
            else if (titleLower.includes(baseGameName)) {
                score = 300;
            }

            console.log(`[API] Result: "${result.name}" - score: ${score}`);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = result;
            }
        }

        const appId = bestMatch.appid;
        const returnedTitle = bestMatch.name;
        console.log(`[API] Best match: "${returnedTitle}" (appid: ${appId}, score: ${bestScore})`);

        // Check if the returned title is actually a good match
        // If score is low, include a warning and provide search link as fallback
        let titleMismatch = false;
        if (bestScore < 300) {
            console.warn(`[API] Low confidence match (score: ${bestScore}) - title may not match search`);
            titleMismatch = true;
        }

        // Get app details directly from Steam (server request, no CORS issues)
        const steamDetailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=US`;

        const detailResponse = await fetch(steamDetailsUrl, {
            headers: {
                'User-Agent': 'SteamScout/1.0'
            }
        });

        if (!detailResponse.ok) {
            console.error(`[API] Steam details returned status ${detailResponse.status}`);
            return res.status(400).json({
                error: `Steam details API returned ${detailResponse.status}`,
                appId,
                prices: []
            });
        }

        const detailData = await detailResponse.json();

        console.log(`[API] Steam response structure:`, Object.keys(detailData || {}));

        if (!detailData || !detailData[appId]?.success) {
            console.log(`[API] Could not fetch details for app ID ${appId}`);
            return res.status(400).json({
                error: `Could not fetch details for app ID ${appId}`,
                appId,
                prices: []
            });
        }

        const appData = detailData[appId].data;
        console.log(`[API] App data keys:`, Object.keys(appData || {}).slice(0, 20));

        // Extract pricing information
        if (!appData.price_overview) {
            console.log(`[API] No pricing data available for ${gameName}`);
            return res.status(200).json({
                appId,
                title: gameName,
                prices: [{
                    shop: { name: 'Steam' },
                    price: 0,
                    regular: 0,
                    url: getSteamUrl({ id: appId, title: gameName }),
                    discount: 0,
                    active: 1,
                    source: 'steam',
                    noPriceData: true
                }],
                noPriceData: true
            });
        }

        const pricing = appData.price_overview;
        const finalPrice = pricing.final / 100;
        const initialPrice = pricing.initial / 100;
        const discount = pricing.discount || 0;

        console.log(`[API] Price found: $${finalPrice} (original: $${initialPrice})`);

        const prices = [{
            shop: { name: 'Steam' },
            price: finalPrice,
            regular: initialPrice,
            url: getSteamUrl({ id: appId, title: gameName }),
            discount,
            active: 1,
            source: 'steam'
        }];

        return res.status(200).json({
            appId,
            title: appData.name || gameName,
            prices,
            noPriceData: false,
            titleMismatch: titleMismatch,
            searchFallbackUrl: `https://store.steampowered.com/search/?term=${encodeURIComponent(gameName)}`
        });

    } catch (error) {
        console.error('[API] Steam search error:', error);
        return res.status(500).json({
            error: error.message || 'Steam search failed',
            appId: null,
            prices: []
        });
    }
}

/**
 * Helper function to generate Steam store URLs
 */
function getSteamUrl(data) {
    if (data.id && Number(data.id) > 0) {
        return `https://store.steampowered.com/app/${data.id}`;
    }

    if (data.title) {
        return `https://store.steampowered.com/search/?term=${encodeURIComponent(data.title)}`;
    }

    return 'https://store.steampowered.com';
}
