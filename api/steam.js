export default async function handler(req, res) {
    const { appid } = req.query;

    if (!appid) {
        return res.status(400).json({ error: "Missing appid" });
    }

    const STEAM_API_KEY = process.env.STEAM_API_KEY;

    if (!STEAM_API_KEY) {
        return res.status(500).json({ error: "Steam API key not configured" });
    }

    try {
        const url = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}&key=${STEAM_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: "Steam API request failed" });
    }
}
