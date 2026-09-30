const DEALS_PER_PAGE = 20;
const CHEAPSHARK_BATCH_SIZE = 60;
const DEAL_CACHE_TTL = 60 * 1000;
const MAX_CACHED_QUERIES = 24;
const dealPrefixes = new Map();
const dealFetchesInFlight = new Map();

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const rawPage = req.query?.page ?? '1';
    if (!/^\d+$/.test(String(rawPage)) || Number(rawPage) < 1 || Number(rawPage) > 1000) {
        return res.status(400).json({ success: false, error: 'Invalid page' });
    }

    const page = Number(rawPage);
    const sort = ['deal', 'discount', 'price'].includes(req.query?.sort)
        ? req.query.sort
        : 'discount';
    if (req.query?.search !== undefined && typeof req.query.search !== 'string') {
        return res.status(400).json({ success: false, error: 'Invalid search' });
    }
    const search = String(req.query?.search || '').trim().toLowerCase().slice(0, 100);

    try {
        let source = process.env.ITAD_API_KEY ? 'itad' : 'cheapshark';
        let result;

        if (source === 'itad') {
            try {
                result = await getUniqueDealsPage(source, page, sort, search);
            } catch (error) {
                console.warn('[API] ITAD failed; using CheapShark:', error.message);
                source = 'cheapshark';
            }
        }

        if (!result) result = await getUniqueDealsPage(source, page, sort, search);

        return res.status(200).json({
            success: true,
            page,
            pageSize: DEALS_PER_PAGE,
            count: result.deals.length,
            hasMore: result.hasMore,
            source,
            deals: result.deals,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[API] Deals page fetch failed:', error.message);
        return res.status(502).json({
            success: false,
            error: 'Unable to load this page. Please try again.',
            page,
            pageSize: DEALS_PER_PAGE,
            deals: []
        });
    }
}

async function getUniqueDealsPage(source, page, sort, search) {
    const cacheKey = `${source}:${sort}:${search}`;
    const requiredCount = page * DEALS_PER_PAGE;

    while (true) {
        const state = getDealPrefix(cacheKey);
        if (state.deals.length >= requiredCount || !state.hasMore) {
            const start = (page - 1) * DEALS_PER_PAGE;
            return {
                deals: state.deals.slice(start, start + DEALS_PER_PAGE),
                hasMore: state.deals.length > start + DEALS_PER_PAGE || state.hasMore
            };
        }

        let pending = dealFetchesInFlight.get(cacheKey);
        if (!pending) {
            pending = extendDealPrefix(state, source, sort, search, requiredCount)
                .catch(error => {
                    dealPrefixes.delete(cacheKey);
                    throw error;
                })
                .finally(() => dealFetchesInFlight.delete(cacheKey));
            dealFetchesInFlight.set(cacheKey, pending);
        }

        await pending;
    }
}

function getDealPrefix(key) {
    let state = dealPrefixes.get(key);
    if (!state || Date.now() - state.updatedAt > DEAL_CACHE_TTL) {
        state = { deals: [], seen: new Set(), offset: 0, hasMore: true, updatedAt: Date.now() };
        dealPrefixes.delete(key);
        dealPrefixes.set(key, state);
    } else {
        dealPrefixes.delete(key);
        dealPrefixes.set(key, state);
    }

    while (dealPrefixes.size > MAX_CACHED_QUERIES) {
        dealPrefixes.delete(dealPrefixes.keys().next().value);
    }
    return state;
}

async function extendDealPrefix(state, source, sort, search, requiredCount) {
    while (state.deals.length < requiredCount && state.hasMore) {
        const batch = source === 'itad'
            ? await fetchITADBatch(state.offset, sort)
            : await fetchCheapSharkBatch(state.offset, sort);
        const rawDeals = batch.deals;

        for (const rawDeal of rawDeals) {
            const deal = source === 'itad' ? normalizeITADDeal(rawDeal) : normalizeCheapSharkDeal(rawDeal);
            if (!isValidDeal(deal)) continue;
            if (search && !deal.title.toLowerCase().includes(search)) continue;

            const key = `steam:${deal.steamAppID}`;
            if (state.seen.has(key)) continue;
            state.seen.add(key);
            state.deals.push(deal);
        }

        state.offset += rawDeals.length;
        state.hasMore = batch.hasMore && rawDeals.length > 0;
        state.updatedAt = Date.now();
    }
}

async function fetchITADBatch(offset, sort) {
    const params = new URLSearchParams({
        country: 'US',
        offset: String(offset),
        limit: String(DEALS_PER_PAGE),
        sort: sort === 'price' ? 'price' : '-cut',
        shops: '61'
    });
    const response = await fetch(`https://api.isthereanydeal.com/deals/v2?${params}`, {
        headers: { 'ITAD-API-Key': process.env.ITAD_API_KEY, Accept: 'application/json' }
    });

    if (!response.ok) throw new Error(`ITAD returned ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.list)) throw new Error('ITAD returned an invalid deal list');
    return { deals: data.list, hasMore: data.hasMore === true };
}

async function fetchCheapSharkBatch(offset, sort) {
    const params = new URLSearchParams({
        storeID: '1',
        pageNumber: String(Math.floor(offset / CHEAPSHARK_BATCH_SIZE)),
        pageSize: String(CHEAPSHARK_BATCH_SIZE),
        sortBy: sort === 'price' ? 'Price' : sort === 'discount' ? 'Savings' : 'Deal Rating'
    });
    const response = await fetch(`https://www.cheapshark.com/api/1.0/deals?${params}`, {
        headers: { 'User-Agent': 'SteamHunt/1.0' }
    });

    if (!response.ok) {
        const message = await response.text();
        if (response.status === 400 && /Too Many Results/i.test(message)) {
            return { deals: [], hasMore: false };
        }
        throw new Error(`CheapShark returned ${response.status}`);
    }

    const deals = await response.json();
    const list = Array.isArray(deals) ? deals : [];
    return { deals: list, hasMore: list.length === CHEAPSHARK_BATCH_SIZE };
}

function normalizeITADDeal(deal) {
    const sourceDeal = deal?.deal;
    if (!sourceDeal) return null;

    const steamAppID = Number.parseInt(deal.appid || deal.app?.id, 10) || null;
    const salePrice = Number(sourceDeal.price?.amount) || 0;
    const normalPrice = Number(sourceDeal.regular?.amount) || 0;
    const expiryDate = sourceDeal.expiry ? Date.parse(sourceDeal.expiry) : NaN;

    return {
        title: deal.title || 'Unknown Game',
        steamAppID,
        steamGameId: deal.id || String(steamAppID || deal.title || ''),
        salePrice,
        normalPrice,
        discount: Number(sourceDeal.cut) || 0,
        expiry: Number.isFinite(expiryDate) ? Math.floor(expiryDate / 1000) : null,
        store: sourceDeal.shop?.name || 'Steam',
        type: salePrice === 0 ? 'giveaway' : 'sale',
        source: 'itad',
        url: sourceDeal.url || getSteamUrl(steamAppID, deal.title)
    };
}

function normalizeCheapSharkDeal(deal) {
    const steamAppID = Number.parseInt(deal.steamAppID, 10) || null;
    const salePrice = Number.parseFloat(deal.salePrice) || 0;
    const normalPrice = Number.parseFloat(deal.normalPrice) || 0;

    return {
        title: deal.title || 'Unknown Game',
        steamAppID,
        steamGameId: String(steamAppID || deal.title || ''),
        salePrice,
        normalPrice,
        discount: Math.round(Number.parseFloat(deal.savings)) || 0,
        expiry: Number.parseInt(deal.dealExpires, 10) || null,
        store: 'Steam',
        type: salePrice === 0 ? 'giveaway' : 'sale',
        source: 'cheapshark',
        url: getSteamUrl(steamAppID, deal.title)
    };
}

function isValidDeal(deal) {
    return Boolean(deal && deal.title && deal.steamAppID && deal.discount > 0 &&
        deal.salePrice < deal.normalPrice && (!deal.expiry || deal.expiry > 0));
}

function getSteamUrl(steamAppID, title) {
    if (steamAppID) return `https://store.steampowered.com/app/${steamAppID}`;
    if (title) return `https://store.steampowered.com/search/?term=${encodeURIComponent(title)}`;
    return 'https://store.steampowered.com';
}