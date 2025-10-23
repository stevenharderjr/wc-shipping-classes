import axios from "axios";
import dotenv from "dotenv";
import { createClient } from "redis";

dotenv.config();

const WC_API_BASE = `${process.env.WC_STORE_URL}/wp-json/wc/v3`;
const AUTH = {
  username: process.env.WC_CONSUMER_KEY,
  password: process.env.WC_CONSUMER_SECRET,
};

// Redis configuration
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Create Redis client
const redisClient = createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
  password: REDIS_PASSWORD,
});

redisClient.on("error", (err) => console.error("Redis Client Error:", err));

// Fetch paginated products from WooCommerce
async function fetchProducts(page = 1, perPage = 100) {
  try {
    const response = await axios.get(`${WC_API_BASE}/products`, {
      auth: AUTH,
      params: { per_page: perPage, page },
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching products page ${page}:`, error.message);
    throw error;
  }
}

// Backup all products to Redis
async function backupProductsToRedis() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupKey = `wc_products_backup_${timestamp}`;
  
  let page = 1;
  let products;
  let allProducts = [];
  let totalFetched = 0;

  try {
    // Connect to Redis
    await redisClient.connect();
    console.log("Connected to Redis");

    console.log("Starting product catalog backup...\n");

    // Fetch all products with pagination
    do {
      products = await fetchProducts(page);
      console.log(`Fetched ${products.length} products from page ${page}`);
      
      allProducts = allProducts.concat(products);
      totalFetched += products.length;
      
      page++;
      
      // Small delay to avoid overwhelming the API
      if (products.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } while (products.length > 0);

    console.log(`\nTotal products fetched: ${totalFetched}`);

    // Store complete catalog in Redis
    await redisClient.set(backupKey, JSON.stringify(allProducts, null, 2));
    console.log(`\n✓ Backup completed successfully!`);
    console.log(`✓ Backup key: ${backupKey}`);
    console.log(`✓ Total products backed up: ${totalFetched}`);

    // Store metadata about the backup
    const metadataKey = `${backupKey}_metadata`;
    const metadata = {
      timestamp,
      totalProducts: totalFetched,
      backupKey,
      storeUrl: process.env.WC_STORE_URL,
    };
    await redisClient.set(metadataKey, JSON.stringify(metadata, null, 2));
    console.log(`✓ Metadata saved to: ${metadataKey}`);

    // List all backup keys
    const allBackupKeys = await redisClient.keys("wc_products_backup_*");
    console.log(`\nTotal backups in Redis: ${allBackupKeys.length / 2}`); // Divided by 2 because metadata keys are also counted
    
    return {
      backupKey,
      totalProducts: totalFetched,
      timestamp,
    };

  } catch (error) {
    console.error("\n✗ Backup failed:", error.message);
    throw error;
  } finally {
    // Disconnect from Redis
    await redisClient.disconnect();
    console.log("\nDisconnected from Redis");
  }
}

// Run the backup
backupProductsToRedis()
  .then((result) => {
    console.log("\n=== Backup Summary ===");
    console.log(`Timestamp: ${result.timestamp}`);
    console.log(`Products: ${result.totalProducts}`);
    console.log(`Redis Key: ${result.backupKey}`);
  })
  .catch((error) => {
    console.error("\nBackup process failed:", error);
    process.exit(1);
  });
