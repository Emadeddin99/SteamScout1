// Test if v02 or newer endpoints exist

const tests = [
  'https://api.isthereanydeal.com/v02/deals/',
  'https://api.isthereanydeal.com/v2/deals/',
  'https://api.isthereanydeal.com/deals/',
];

async function testUrl(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log(`${response.status} | ${url}`);
    if (response.status !== 404) {
      console.log('   Response:', text.substring(0, 200));
    }
  } catch (err) {
    console.log(`ERR | ${url} | ${err.message}`);
  }
}

async function main() {
  for (const url of tests) {
    await testUrl(url);
  }
  
  // Try checking if ITAD actually has a public API
  console.log('\n--- Checking ITAD main site for API info ---');
  try {
    const response = await fetch('https://isthereanydeal.com');
    console.log('Main site status:', response.status);
  } catch (err) {
    console.log('Main site error:', err.message);
  }
}

main();
