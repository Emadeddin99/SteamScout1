/**
 * CheapShark Game Search API Handler
 * Searches games on CheapShark without needing CORS proxy
 * Returns real Steam prices and deals
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
        const { gameName } = req.query;

        if (!gameName) {
            return res.status(400).json({ error: 'Missing gameName parameter' });
        }

        console.log(`[CHEAPSHARK] Searching for: ${gameName}`);

        // Search CheapShark for deals - this API requires searching by filtering all deals
        // We'll fetch current deals and filter by game name
        const dealsUrl = 'https://www.cheapshark.com/api/1.0/deals?storeID=1&pageNumber=0&pageSize=60&sortBy=Deal Rating';
        
        const dealsResponse = await fetch(dealsUrl, {
            headers: {
                'User-Agent': 'SteamScout/1.0'
            }
        });

        if (!dealsResponse.ok) {
            console.error(`[CHEAPSHARK] Deals API returned ${dealsResponse.status}`);
            return res.status(400).json({
                error: `CheapShark API returned ${dealsResponse.status}`,
                prices: []
            });
        }

        const deals = await dealsResponse.json();

        if (!Array.isArray(deals) || deals.length === 0) {
            console.log(`[CHEAPSHARK] No deals found`);
            return res.status(404).json({
                error: 'No deals found',
                prices: []
            });
        }

        // Search for game by name (case-insensitive, partial match)
        const gameNameLower = gameName.toLowerCase();
        const matchingDeals = deals.filter(deal => 
            deal.title.toLowerCase().includes(gameNameLower)
        );

        console.log(`[CHEAPSHARK] Found ${matchingDeals.length} deals matching "${gameName}"`);

        if (matchingDeals.length === 0) {
            // Try looser matching - search by first word
            const firstWord = gameName.split('(')[0].trim().split(' ')[0].toLowerCase();
            const looserMatches = deals.filter(deal => 
                deal.title.toLowerCase().includes(firstWord)
            );
            
            console.log(`[CHEAPSHARK] Looser match (first word "${firstWord}"): ${looserMatches.length} deals`);
            
            if (looserMatches.length === 0) {
                return res.status(404).json({
                    error: `Game "${gameName}" not found in current deals`,
                    prices: []
                });
            }

            // Return best deal from looser matches
            const bestDeal = looserMatches[0];
            return formatResponse(bestDeal);
        }

        // Return best deal (first one is sorted by rating)
        const bestDeal = matchingDeals[0];
        return formatResponse(bestDeal, res);

    } catch (error) {
        console.error('[CHEAPSHARK] Search error:', error);
        return res.status(500).json({
            error: error.message || 'CheapShark search failed',
            prices: []
        });
    }
}

function formatResponse(deal, res) {
    const salePrice = parseFloat(deal.salePrice) || 0;
    const normalPrice = parseFloat(deal.normalPrice) || 0;
    const discount = Math.round(parseFloat(deal.savings)) || 0;

    const prices = [{
        shop: { name: 'Steam' },
        price: salePrice,
        regular: normalPrice,
        url: `https://store.steampowered.com/app/${deal.steamAppID}`,
        discount: discount,
        active: 1,
        source: 'cheapshark',
        dealUrl: deal.gameID ? `https://www.cheapshark.com/api/redirect/steam/${deal.gameID}` : null
    }];

    return res.status(200).json({
        title: deal.title,
        steamAppID: deal.steamAppID,
        prices,
        source: 'cheapshark'
    });
}
