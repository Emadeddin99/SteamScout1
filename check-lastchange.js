// Check lastChange field to estimate expiry

async function test() {
  try {
    const response = await fetch('https://www.cheapshark.com/api/1.0/deals?storeID=1&pageSize=5');
    const deals = await response.json();
    
    console.log('Sample CheapShark deals with lastChange:\n');
    
    for (let i = 0; i < Math.min(3, deals.length); i++) {
      const deal = deals[i];
      const lastChangeMs = parseInt(deal.lastChange) * 1000;
      const lastChangeDate = new Date(lastChangeMs);
      const now = new Date();
      const hoursSinceUpdate = (now - lastChangeDate) / (1000 * 60 * 60);
      
      console.log(`Deal: ${deal.title}`);
      console.log(`  lastChange: ${deal.lastChange}`);
      console.log(`  As date: ${lastChangeDate.toISOString()}`);
      console.log(`  Hours since update: ${hoursSinceUpdate.toFixed(1)}`);
      console.log(`  Discount: ${deal.savings}%`);
      console.log();
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
