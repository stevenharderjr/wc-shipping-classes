import axios from 'axios';

const WP_API_BASE = `${process.env.WC_STORE_URL}/wp-json/wp/v2`;
const auth = {
  username: process.env.WP_USERNAME,       // WordPress admin user with REST API access
  password: process.env.WP_PASSWORD,
};

async function getWeightUnit() {
  try {
    const response = await axios.get(`${WP_API_BASE}/settings`, {
      auth,
    });
    const weightUnit = response.data.woocommerce_weight_unit;
    console.log("Weight unit is:", weightUnit);
    return weightUnit;
  } catch (error) {
    console.error("Error fetching WooCommerce weight unit:", error.response?.data || error.message);
  }
}

getWeightUnit();
