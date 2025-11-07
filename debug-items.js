// Debug script for inventory items issue
// Run this in your browser console while on the inventory page

console.log('=== INVENTORY DEBUG SCRIPT ===');

// Check if axios is available
if (typeof axios === 'undefined') {
  console.error('❌ Axios not available. Make sure you\'re on the application page.');
} else {
  console.log('✅ Axios available');
}

// Test 1: Check if we can fetch items
console.log('\n--- Test 1: Fetching items from API ---');
axios.get('/inventory/items')
  .then(response => {
    console.log('✅ API Response:', response.data);
    console.log('📊 Count:', response.data.count);
    console.log('📦 Items:', response.data.data);

    if (response.data.data && response.data.data.length > 0) {
      console.log('✅ Items found!');
      console.log('First item:', response.data.data[0]);
    } else {
      console.log('⚠️ No items in response');
    }
  })
  .catch(error => {
    console.error('❌ Error fetching items:', error);
    console.error('Error response:', error.response?.data);
  });

// Test 2: Check the last created item
console.log('\n--- Test 2: Checking database for items ---');
console.log('Open Prisma Studio at: http://localhost:5555');
console.log('Navigate to the "Item" model and check:');
console.log('1. How many items exist?');
console.log('2. What are their status values?');
console.log('3. What are their inventoryStatus values?');
console.log('4. Is deletedAt null for all items?');
console.log('5. What is the "repaired" field value?');

// Test 3: Try creating a test item
console.log('\n--- Test 3: Manual API Test ---');
console.log('To manually test item creation, run this in console:');
console.log(`
axios.post('/inventory/items', {
  serialNumber: 'TEST-' + Date.now(),
  modelId: 'YOUR_MODEL_ID_HERE',
  condition: 'New',
  inboundDate: new Date().toISOString()
})
.then(res => {
  console.log('✅ Item created:', res.data);
  console.log('Now fetch items again...');
  return axios.get('/inventory/items');
})
.then(res => console.log('📦 Items after creation:', res.data))
.catch(err => console.error('❌ Error:', err.response?.data));
`);

console.log('\n--- Test 4: Check React Query Cache ---');
console.log('The issue might be React Query cache not updating.');
console.log('Check if the cache invalidation is working by watching the Network tab.');
