import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const WC_API_BASE = `${process.env.WC_STORE_URL}/wp-json/wc/v3`;
const AUTH = {
  username: process.env.WC_CONSUMER_KEY,
  password: process.env.WC_CONSUMER_SECRET,
};

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

// Backup all products to a JSON file
async function backupProductsToFile() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupsDir = path.join(process.cwd(), "backups");
  const backupFilePath = path.join(backupsDir, `products_backup_${timestamp}.json`);
  
  let page = 1;
  let products;
  let allProducts = [];
  let totalFetched = 0;

  try {
    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
      console.log(`Created backups directory: ${backupsDir}\n`);
    }

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

    // Create backup object with metadata
    const backupData = {
      metadata: {
        timestamp,
        totalProducts: totalFetched,
        storeUrl: process.env.WC_STORE_URL,
        backupDate: new Date().toISOString(),
      },
      products: allProducts,
    };

    // Write to file
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), "utf-8");
    
    console.log(`\n✓ Backup completed successfully!`);
    console.log(`✓ File: ${backupFilePath}`);
    console.log(`✓ Total products backed up: ${totalFetched}`);
    console.log(`✓ File size: ${(fs.statSync(backupFilePath).size / 1024 / 1024).toFixed(2)} MB`);

    // List all backups
    const backupFiles = fs.readdirSync(backupsDir)
      .filter(file => file.startsWith("products_backup_") && file.endsWith(".json"))
      .sort()
      .reverse();
    
    console.log(`\nTotal backups in directory: ${backupFiles.length}`);
    if (backupFiles.length > 1) {
      console.log("\nRecent backups:");
      backupFiles.slice(0, 5).forEach((file, index) => {
        const filePath = path.join(backupsDir, file);
        const stats = fs.statSync(filePath);
        console.log(`  ${index + 1}. ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      });
    }
    
    return {
      backupFilePath,
      totalProducts: totalFetched,
      timestamp,
    };

  } catch (error) {
    console.error("\n✗ Backup failed:", error.message);
    throw error;
  }
}

// Run the backup
backupProductsToFile()
  .then((result) => {
    console.log("\n=== Backup Summary ===");
    console.log(`Timestamp: ${result.timestamp}`);
    console.log(`Products: ${result.totalProducts}`);
    console.log(`File: ${result.backupFilePath}`);
  })
  .catch((error) => {
    console.error("\nBackup process failed:", error);
    process.exit(1);
  });
