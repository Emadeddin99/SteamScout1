// REMOVED: ITAD endpoint tests (Steam-only build)
console.log('test-itad-endpoints.js removed');

async function testITAD() {
  try {
    const url = `https://api.isthereanydeal.com/v01/deals/list/?key=${ITAD_API_KEY}&country=US&shops=steam&limit=10&sort=discount`;
    
    console.log('Testing ITAD endpoint...');
    console.log('URL:', url.substring(0, 100) + '...\n');
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SteamScout/1.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('Status:', response.status);
    
    if (!response.ok) {
      const text = await response.text();
      console.log('Error:', text);
      return;
    }
    
    const data = await response.json();
    console.log('Response type:', typeof data, Array.isArray(data) ? 'Array' : 'Object');
    console.log('Keys:', Object.keys(data).slice(0, 10));
    
    // Check first deal for expiry field
    if (Array.isArray(data) && data.length > 0) {
      console.log('\nFirst deal:', JSON.stringify(data[0], null, 2).substring(0, 500));
    } else if (data.deals && data.deals.length > 0) {
      console.log('\nFirst deal:', JSON.stringify(data.deals[0], null, 2).substring(0, 500));
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function testSteamDB() {
  try {
    console.log('\n\n--- Testing SteamDB ---');
    console.log('Note: SteamDB is community-run, may not have API');
    
    // Try common SteamDB endpoints
    const urls = [
      'https://steamdb.info/api/',
      'https://api.steamdb.info/',
    ];
    
    for (const url of urls) {
      try {
        const response = await fetch(url);
        console.log(`${url}: ${response.status}`);
      } catch (err) {
        console.log(`${url}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testITAD().then(() => testSteamDB());
