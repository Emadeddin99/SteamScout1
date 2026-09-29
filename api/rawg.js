export default async function handler(req, res) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    const apiKey = process.env.RAWG_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'RAWG_API_KEY is not configured' });
    }

    const { search } = req.query;
    if (typeof search !== 'string' || !search.trim()) {
        return res.status(400).json({ error: 'Provide a valid search term' });
    }

    const params = new URLSearchParams({
        search: search.trim(),
        page_size: '8',
        key: apiKey
    });

    try {
        const response = await fetch(`https://api.rawg.io/api/games?${params}`, {
            headers: { Accept: 'application/json' }
        });
        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: 'RAWG search failed' });
        }

        const results = Array.isArray(data.results) ? data.results : [];
        return res.status(200).json({
            results: results.map(game => ({
                id: game.id,
                name: game.name,
                background_image: game.background_image,
                rating: game.rating
            }))
        });
    } catch (error) {
        console.error('[API] RAWG request failed:', error);
        return res.status(502).json({ error: 'RAWG request failed' });
    }
}