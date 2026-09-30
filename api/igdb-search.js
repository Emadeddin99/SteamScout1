let cachedToken = null;
let tokenRequest = null;

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const search = typeof req.query?.search === 'string'
        ? req.query.search.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100)
        : '';

    if (!search) {
        return res.status(200).json({ results: [] });
    }

    if (!process.env.IGDB_CLIENT_ID || !process.env.IGDB_CLIENT_SECRET) {
        console.error('[API] IGDB credentials are not configured');
        return res.status(503).json({ error: 'Game search is temporarily unavailable.' });
    }

    try {
        let accessToken = await getAccessToken();
        let response = await searchIGDB(search, accessToken);

        if (response.status === 401) {
            cachedToken = null;
            accessToken = await getAccessToken();
            response = await searchIGDB(search, accessToken);
        }

        if (!response.ok) {
            console.error(`[API] IGDB search failed (${response.status})`);
            return res.status(502).json({ error: 'Game search is temporarily unavailable.' });
        }

        let games = await response.json();

        if (Array.isArray(games) && games.length === 0) {
            const fallbackSearch = getFallbackSearch(search);
            if (fallbackSearch) {
                const fallbackResponse = await searchIGDB(
                    fallbackSearch.term,
                    accessToken,
                    fallbackSearch.matchAnywhere
                );
                if (fallbackResponse.ok) games = await fallbackResponse.json();
            }
        }

        const rankedGames = (Array.isArray(games) ? games : [])
            .map((game, index) => ({ game, index, score: scoreGameMatch(search, game.name) }))
            .sort((first, second) => second.score - first.score || first.index - second.index)
            .slice(0, 8)
            .map(({ game }) => game);

        return res.status(200).json({
            results: rankedGames.map(game => ({
                id: game.id,
                name: game.name,
                background_image: /^[\w-]+$/.test(game.cover?.image_id || '')
                    ? `https://images.igdb.com/igdb/image/upload/t_cover_small/${game.cover.image_id}.jpg`
                    : '',
                rating: Number.isFinite(game.rating) ? Math.round(game.rating / 2) / 10 : null,
                platforms: Array.isArray(game.platforms)
                    ? game.platforms.map(platform => ({ platform: { name: platform.name } }))
                    : []
            }))
        });
    } catch (error) {
        console.error('[API] IGDB search request failed:', error.message);
        return res.status(502).json({ error: 'Game search is temporarily unavailable.' });
    }
}

async function getAccessToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
        return cachedToken.value;
    }

    if (!tokenRequest) {
        tokenRequest = requestAccessToken().finally(() => {
            tokenRequest = null;
        });
    }

    return tokenRequest;
}

async function requestAccessToken() {
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.IGDB_CLIENT_ID,
            client_secret: process.env.IGDB_CLIENT_SECRET,
            grant_type: 'client_credentials'
        })
    });

    if (!response.ok) {
        console.error(`[API] Twitch token request failed (${response.status})`);
        throw new Error('IGDB authentication failed');
    }

    const token = await response.json();
    if (typeof token.access_token !== 'string' || !Number.isFinite(token.expires_in)) {
        throw new Error('Twitch returned an invalid access token response');
    }

    cachedToken = {
        value: token.access_token,
        expiresAt: Date.now() + token.expires_in * 1000
    };
    return cachedToken.value;
}

function searchIGDB(search, accessToken, matchAnywhere = false) {
    const safeSearch = search.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const query = matchAnywhere
        ? `fields name,rating,cover.image_id,platforms.name; where name ~ *"${safeSearch}"*; sort rating desc; limit 30;`
        : `search "${safeSearch}"; fields name,rating,cover.image_id,platforms.name; limit 30;`;

    return fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
            'Client-ID': process.env.IGDB_CLIENT_ID,
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'text/plain'
        },
        body: query
    });
}

function getFallbackSearch(search) {
    const normalizedSearch = normalizeTitle(search);
    if (normalizedSearch.length >= 3 && normalizedSearch.length <= 4) {
        return { term: normalizedSearch, matchAnywhere: true };
    }

    const terms = normalizedSearch.split(' ').filter(term => term.length >= 5);
    if (!terms.length) return null;
    return {
        term: terms.sort((first, second) => second.length - first.length)[0].slice(0, 4),
        matchAnywhere: true
    };
}

function scoreGameMatch(search, title) {
    const normalizedSearch = normalizeTitle(search);
    const normalizedTitle = normalizeTitle(title);
    if (!normalizedSearch || !normalizedTitle) return 0;
    if (normalizedTitle === normalizedSearch) return 10000;
    if (normalizedTitle.startsWith(normalizedSearch)) return 9000 + normalizedSearch.length;
    if (normalizedTitle.includes(normalizedSearch)) return 8000 + normalizedSearch.length;

    const titleTerms = normalizedTitle.split(' ');
    const searchTerms = normalizedSearch.split(' ');
    const matchedTerms = searchTerms.filter(term =>
        titleTerms.some(titleTerm => titleTerm === term || titleTerm.startsWith(term))
    ).length;
    const coverage = matchedTerms / searchTerms.length;

    if (coverage > 0) return 1000 * coverage + matchedTerms;
    if (normalizedSearch.length >= 5) {
        const similarity = getTitleSimilarity(normalizedSearch, titleTerms);
        if (similarity >= 0.72) return similarity * 500;
    }
    return 0;
}

function getTitleSimilarity(search, titleTerms) {
    let bestSimilarity = 0;
    for (let start = 0; start < titleTerms.length; start++) {
        let candidate = '';
        for (let end = start; end < Math.min(start + 3, titleTerms.length); end++) {
            candidate += titleTerms[end];
            const distance = editDistance(search, candidate);
            const similarity = 1 - distance / Math.max(search.length, candidate.length);
            bestSimilarity = Math.max(bestSimilarity, similarity);
        }
    }
    return bestSimilarity;
}

function normalizeTitle(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function editDistance(first, second) {
    const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
    for (let firstIndex = 1; firstIndex <= first.length; firstIndex++) {
        const current = [firstIndex];
        for (let secondIndex = 1; secondIndex <= second.length; secondIndex++) {
            const substitutionCost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
            current[secondIndex] = Math.min(
                current[secondIndex - 1] + 1,
                previous[secondIndex] + 1,
                previous[secondIndex - 1] + substitutionCost
            );
        }
        previous.splice(0, previous.length, ...current);
    }
    return previous[second.length];
}