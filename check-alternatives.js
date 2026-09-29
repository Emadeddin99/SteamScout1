// Test alternative sources for expiry data

async function testSteamAPI() {
  console.log('--- Testing Steam Official API ---');
  try {
    // Steam's featured deals endpoint
    const response = await fetch('https://store.steampowered.com/api/featured/');
    const data = await response.json();
    
    console.log('Steam Featured status:', response.status);
    console.log('Keys:', Object.keys(data).slice(0, 5));
    
    if (data.featured_win && data.featured_win.length > 0) {
      console.log('\nFirst featured deal:');
      console.log(JSON.stringify(data.featured_win[0], null, 2).substring(0, 300));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function testGGDeals() {
  console.log('\n--- Testing GG.deals ---');
  try {
    // GG.deals doesn't have a public API for scraping
    const response = await fetch('https://gg.deals/api/');
    console.log('GG.deals API status:', response.status);
  } catch (err) {
    console.error('GG.deals:', err.message);
  }
}

async function testProtonDB() {
  console.log('\n--- Testing ProtonDB (for reference) ---');
  try {
    const appId = 310560; // Portal 2
    const response = await fetch(`https://protondb.com/api/v1/reports/${appId}`);
    console.log('ProtonDB status:', response.status);
  } catch (err) {
    console.error('ProtonDB:', err.message);
  }
}

async function main() {
  await testSteamAPI();
  await testGGDeals();
  await testProtonDB();
  
  console.log('\n--- Conclusion ---');
  console.log('Steam API: Returns featured/bestselling deals but not all sales');
  console.log('CheapShark: Best option, but needs expiry estimation');
  console.log('GG.deals: No public API');
  console.log('ITAD: API key may be invalid/expired');
}

main();
