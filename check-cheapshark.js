// Check what CheapShark actually returns

async function test() {
  try {
    const response = await fetch('https://www.cheapshark.com/api/1.0/deals?pageNumber=0&pageSize=10&sortBy=Deal Rating');
    const data = await response.json();
    
    console.log(`Got ${data.length} deals from CheapShark\n`);
    
    // Show first 3 deals in detail
    for (let i = 0; i < Math.min(3, data.length); i++) {
      const deal = data[i];
      console.log(`Deal ${i + 1}:`);
      console.log(`  Title: ${deal.title}`);
      console.log(`  StoreID: ${deal.storeID}`);
      console.log(`  SteamAppID: ${deal.steamAppID}`);
      console.log(`  Savings: ${deal.savings}%`);
      console.log(`  SalePrice: ${deal.salePrice}`);
      console.log(`  NormalPrice: ${deal.normalPrice}`);
      console.log();
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
