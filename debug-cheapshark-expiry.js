// Check what CheapShark actually returns for expiry

async function test() {
  try {
    const response = await fetch('https://www.cheapshark.com/api/1.0/deals?storeID=1&pageSize=10');
    const data = await response.json();
    
    console.log(`Sample CheapShark deals (storeID=1, first 5):\n`);
    
    for (let i = 0; i < Math.min(5, data.length); i++) {
      const deal = data[i];
      console.log(`Deal ${i + 1}: ${deal.title}`);
      console.log(`  dealExpires: ${deal.dealExpires}`);
      console.log(`  normalPrice: ${deal.normalPrice}`);
      console.log(`  salePrice: ${deal.salePrice}`);
      console.log(`  savings: ${deal.savings}%`);
      console.log(`  storeID: ${deal.storeID}`);
      console.log(`  All keys: ${Object.keys(deal).join(', ')}`);
      console.log();
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
