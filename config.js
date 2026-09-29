// config.js - Client-side application configuration.
// API keys belong in Vercel/serverless environment variables, never in this file.

const API_CONFIG = {
    // API routes are same-origin serverless proxies.
    RAWG_API_KEY: '',
    ITAD_API_KEY: '',
    RAWG_GAMES_URL: '/api/rawg',
    DEALS_URL: '/api/deals',
    STEAM_SEARCH_URL: '/api/steam-search'
};

// Legacy helper retained for compatibility with older saved integrations.
async function directFetch(url, retries = 2) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Game Price Calculator',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
    };
    
    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            console.warn(`API returned status ${response.status} for URL: ${url}`);
            if (retries > 0 && response.status === 500) {
                console.log(`Retrying (${retries} retries left)...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
                return directFetch(url, retries - 1);
            }
            return null;
        }
        return await response.json();
    } catch (error) {
        // Check if it's a CORS error (common with Epic API from file:// origin)
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
            console.warn('⚠️ CORS blocked or network error:', url);
            console.warn('Note: Some APIs block file:// origin access. This is expected in local development.');
            return null;
        }
        console.error('Fetch error:', error.message, 'URL:', url);
        if (retries > 0 && error.message.includes('Failed')) {
            console.log(`Retrying (${retries} retries left)...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return directFetch(url, retries - 1);
        }
        return null;
    }
}

// Legacy Config class for backward compatibility
class Config {
    constructor() {
        this.env = {
            // RAWG API Configuration (Primary - Game Search & Details)
            rawgApiUrl: localStorage.getItem('rawgApiUrl') || 'https://api.rawg.io/api',
            rawgApiKey: localStorage.getItem('rawgApiKey') || API_CONFIG.RAWG_API_KEY,
            rawgEnabled: true,
            
            // Steam Web API Configuration (Direct API with key)
            steamApiUrl: localStorage.getItem('steamApiUrl') || 'https://store.steampowered.com/api',
            steamApiKey: localStorage.getItem('steamApiKey') || API_CONFIG.STEAM_API_KEY,
            steamEnabled: true,
            
            // CheapShark API Configuration (used for Steam deals)
            cheapsharkApiUrl: localStorage.getItem('cheapsharkApiUrl') || 'https://www.cheapshark.com/api/1.0',
            cheapsharkEnabled: true,
            
            // Application Settings
            appName: 'Steam Price Calculator',
            appVersion: '2.3',
            environment: 'vercel',
            deploymentMode: 'serverless',
            
            // Features
            enableDeals: true,
            enableHistory: true,
            enablePrint: true,
            enableDarkMode: true,
        };
    }
    
    // Get config value
    get(key) {
        return this.env[key];
    }
    
    // Set config value
    set(key, value) {
        this.env[key] = value;
        // Persist to localStorage
        if (typeof value === 'string') {
            localStorage.setItem(key, value);
        }
    }
    
    // Set multiple values
    setMultiple(values) {
        Object.keys(values).forEach(key => {
            this.set(key, values[key]);
        });
    }
    
    // Get all config
    getAll() {
        return { ...this.env };
    }
    
    // Check if feature is enabled
    isFeatureEnabled(feature) {
        return this.env[`enable${feature.charAt(0).toUpperCase()}${feature.slice(1)}`] === true;
    }
    
    // Get Steam Web API URL
    getSteamUrl() {
        return this.get('steamApiUrl');
    }
    
    // Get Steam headers
    getSteamHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
    }
    

    
    // Get RAWG API URL
    getRawgUrl() {
        return this.get('rawgApiUrl');
    }
    
    // Get RAWG API Key
    getRawgApiKey() {
        return this.get('rawgApiKey');
    }
    
    // Get RAWG headers
    getRawgHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
    }
}

// Create global config instance
const appConfig = new Config();

// Export for use in modules (if using modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = appConfig;
}
