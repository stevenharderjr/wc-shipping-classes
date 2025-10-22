require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const WC_API_BASE = `${process.env.PRIVATE_WC_URL}/wp-json/wc/v3`;
const AUTH = {
  username: process.env.PRIVATE_WC_CONSUMER_KEY,
  password: process.env.PRIVATE_WC_CONSUMER_SECRET,
};

async function fetchOneProduct() {
  try {
    const response = await axios.get(`${WC_API_BASE}/products`, {
      auth: AUTH,
      params: { per_page: 1, page: 1 },
    });
    const product = response.data[0];
    
    const outputPath = path.join(__dirname, 'product.json');
    await fs.writeFile(outputPath, JSON.stringify(product, null, 2), 'utf-8');
    
    console.log(`Product data written to ${outputPath}`);
  } catch (error) {
    console.error('Error fetching product:', error.response?.data || error.message);
  }
}

fetchOneProduct();
