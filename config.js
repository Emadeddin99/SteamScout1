// config.js - Client-side application configuration.
// API keys belong in Vercel/serverless environment variables, never in this file.

const API_CONFIG = {
    // API routes are same-origin serverless proxies.
    IGDB_GAMES_URL: '/api/igdb-search',
    DEALS_URL: '/api/deals',
    STEAM_SEARCH_URL: '/api/steam-search'
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = API_CONFIG;
}
