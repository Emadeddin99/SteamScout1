/**
 * Steam Search API Handler
 * Searches for games on Steam directly from server (no CORS needed)
 * Server-side requests work with Steam API unlike browser requests
 */

const MAX_RETRIES = 2;
const RETRY_DELAY = 500; // ms

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    try {
        const { gameName } = req.query;

        if (!gameName) {
            return res.status(400).json({ error: 'Missing gameName parameter' });
        }

        // Call Steam search directly from server (works without CORS proxy)
        const steamSearchUrl = `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(gameName)}`;
        
        const searchResponse = await fetch(steamSearchUrl, {
            headers: {
                'User-Agent': 'SteamHunt/1.0'
            }
        });

        if (!searchResponse.ok) {
            return res.status(502).json({
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

        // Score normalized names so punctuation and Roman-numeral differences do not hide valid Steam matches.
        const gameNameLower = gameName.toLowerCase();
        const normalizedQuery = normalizeTitle(gameName);
        let bestMatch = searchData[0];
        let bestScore = 0;

        const yearMatch = gameName.match(/\((\d{4})\)/);
        const searchYear = yearMatch ? yearMatch[1] : null;
        const baseGameName = normalizeTitle(gameName.split('(')[0]);

        for (const result of searchData.slice(0, 15)) {
            const titleLower = result.name.toLowerCase();
            const normalizedTitle = normalizeTitle(result.name);
            let score = 0;

            const isSequel = /ragnar|remaster|remake|director'?s cut|edition|deluxe|goty|complete/.test(titleLower);
            const wantSequel = /ragnar|remaster|remake|director'?s cut|edition|deluxe|goty|complete/.test(gameNameLower);
            
            if (isSequel && !wantSequel) {
                score = -100;
            }

            if (normalizedTitle === normalizedQuery) {
                score = 1000;
            } else if (searchYear && titleLower.includes(searchYear)) {
                score = 800;
            } else if (normalizedTitle.startsWith(baseGameName)) {
                score = 500;
            } else if (normalizedTitle.includes(baseGameName)) {
                score = 300;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = result;
            }
        }

        const appId = bestMatch.appid;
        const returnedTitle = bestMatch.name;

        let titleMismatch = false;
        if (bestScore < 300) {
            titleMismatch = true;
        }

        // Use Steam's app ID for the authoritative details and price request.
        const steamDetailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=US`;

        const detailResponse = await fetch(steamDetailsUrl, {
            headers: {
                'User-Agent': 'SteamHunt/1.0'
            }
        });

        if (!detailResponse.ok) {
            return res.status(502).json({
                error: `Steam details API returned ${detailResponse.status}`,
                appId,
                prices: []
            });
        }

        const detailData = await detailResponse.json();

        if (!detailData || !detailData[appId]?.success) {
            return res.status(502).json({
                error: `Could not fetch details for app ID ${appId}`,
                appId,
                prices: []
            });
        }

        const appData = detailData[appId].data;
        if (!appData.price_overview) {
            return res.status(200).json({
                appId,
                title: appData.name || returnedTitle || gameName,
                prices: [{
                    shop: { name: 'Steam' },
                    price: 0,
                    regular: 0,
                    url: getSteamUrl({ id: appId, title: appData.name || gameName }),
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

        const prices = [{
            shop: { name: 'Steam' },
            price: finalPrice,
            regular: initialPrice,
            url: getSteamUrl({ id: appId, title: appData.name || gameName }),
            discount,
            active: 1,
            source: 'steam'
        }];

        return res.status(200).json({
            appId,
            title: appData.name || returnedTitle || gameName,
            prices,
            noPriceData: false,
            titleMismatch,
            searchFallbackUrl: `https://store.steampowered.com/search/?term=${encodeURIComponent(gameName)}`
        });

    } catch (error) {
        console.error('[API] Steam search error:', error.message);
        return res.status(502).json({
            error: error.message || 'Steam search failed',
            appId: null,
            prices: []
        });
    }
}

function normalizeTitle(title) {
    const romanNumerals = {
        i: '1', ii: '2', iii: '3', iv: '4', v: '5',
        vi: '6', vii: '7', viii: '8', ix: '9', x: '10'
    };

    return String(title)
        .replace(/[™®©]/g, '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\b[ivx]+\b/g, numeral => romanNumerals[numeral] || numeral)
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function getSteamUrl(data) {
    if (data.id && Number(data.id) > 0) {
        return `https://store.steampowered.com/app/${data.id}`;
    }

    if (data.title) {
        return `https://store.steampowered.com/search/?term=${encodeURIComponent(data.title)}`;
    }

    return 'https://store.steampowered.com';
}