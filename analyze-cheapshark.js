// Check actual normalization process

async function test() {
  try {
    const response = await fetch('https://www.cheapshark.com/api/1.0/deals?pageNumber=0&pageSize=100&sortBy=Deal Rating');
    const data = await response.json();
    
    console.log(`Total deals: ${data.length}\n`);
    
    // Count by storeID
    const storeIds = {};
    const steamDeals = [];
    
    for (const deal of data) {
      storeIds[deal.storeID] = (storeIds[deal.storeID] || 0) + 1;
      if (deal.storeID === '1') {
        steamDeals.push(deal);
      }
    }
    
    console.log('Deals by StoreID:');
    for (const [id, count] of Object.entries(storeIds).sort()) {
      console.log(`  ${id}: ${count} deals`);
    }
    
    console.log(`\nSteam deals (storeID=1): ${steamDeals.length}`);
    
    // Check for duplicates by steamAppID
    const appIds = {};
    for (const deal of steamDeals) {
      const id = deal.steamAppID;
      if (!appIds[id]) appIds[id] = [];
      appIds[id].push({
        title: deal.title,
        savings: deal.savings,
        salePrice: deal.salePrice,
        storeID: deal.storeID
      });
    }
    
    const duplicates = Object.values(appIds).filter(arr => arr.length > 1);
    console.log(`Steam app IDs with duplicates: ${duplicates.length}`);
    
    if (duplicates.length > 0) {
      console.log('\nFirst duplicate app:');
      console.log('Deals for this app:');
      duplicates[0].forEach((d, i) => {
        console.log(`  ${i+1}. ${d.title} - ${d.savings.toFixed(1)}% off - Store ${d.storeID}`);
      });
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
