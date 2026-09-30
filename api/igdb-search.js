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
        let response = await searchIGDB(search, await getAccessToken());

        if (response.status === 401) {
            cachedToken = null;
            response = await searchIGDB(search, await getAccessToken());
        }

        if (!response.ok) {
            console.error(`[API] IGDB search failed (${response.status})`);
            return res.status(502).json({ error: 'Game search is temporarily unavailable.' });
        }

        const games = await response.json();
        return res.status(200).json({
            results: (Array.isArray(games) ? games : []).map(game => ({
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

function searchIGDB(search, accessToken) {
    const safeSearch = search.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const query = `search "${safeSearch}"; fields name,rating,cover.image_id,platforms.name; limit 8;`;

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