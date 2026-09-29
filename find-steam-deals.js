// Try CheapShark with different parameters to find Steam deals

const tests = [
  // Store parameter - 1 is Steam
  'https://www.cheapshark.com/api/1.0/deals?storeID=1',
  'https://www.cheapshark.com/api/1.0/deals?store=steam',
  
  // Check available stores
  'https://www.cheapshark.com/api/1.0/stores',
  
  // Different sorting
  'https://www.cheapshark.com/api/1.0/deals?sortBy=Savings&pageSize=100',
];

async function testUrl(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    const count = Array.isArray(data) ? data.length : Object.keys(data).length;
    console.log(`\n✓ ${url}`);
    console.log(`  Response type: ${Array.isArray(data) ? 'Array' : 'Object'}`);
    if (Array.isArray(data)) {
      console.log(`  Items: ${count}`);
      if (count > 0 && data[0].storeID) {
        console.log(`  Sample storeID: ${data[0].storeID}`);
      }
    } else {
      console.log(`  Keys: ${Object.keys(data).slice(0, 5).join(', ')}`);
    }
  } catch (err) {
    console.log(`\n✗ ${url}`);
    console.log(`  Error: ${err.message}`);
  }
}

async function main() {
  for (const url of tests) {
    await testUrl(url);
  }
}

main();
