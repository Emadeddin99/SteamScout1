export default async function handler(req, res) {
    const apiKey = process.env.RAWG_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'RAWG_API_KEY is not configured' });
    }

    const { search, id } = req.query;
    let endpoint;

    if (typeof search === 'string' && search.trim()) {
        const params = new URLSearchParams({
            search: search.trim(),
            page_size: '8',
            key: apiKey
        });
        endpoint = `https://api.rawg.io/api/games?${params}`;
    } else if (typeof id === 'string' && /^\d+$/.test(id)) {
        endpoint = `https://api.rawg.io/api/games/${id}?key=${encodeURIComponent(apiKey)}`;
    } else {
        return res.status(400).json({ error: 'Provide a valid search or game id' });
    }

    try {
        const response = await fetch(endpoint, {
            headers: { Accept: 'application/json' }
        });
        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error) {
        console.error('[API] RAWG request failed:', error);
        return res.status(502).json({ error: 'RAWG request failed' });
    }
}