import { createClient } from "redis";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

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

// List all available backups
async function listBackups() {
  try {
    await redisClient.connect();
    console.log("Connected to Redis\n");

    const backupKeys = await redisClient.keys("wc_products_backup_*");
    
    // Filter to get only main backup keys (not metadata)
    const mainBackupKeys = backupKeys.filter(key => !key.endsWith("_metadata"));
    
    if (mainBackupKeys.length === 0) {
      console.log("No backups found in Redis.");
      return [];
    }

    console.log(`Found ${mainBackupKeys.length} backup(s):\n`);

    for (const key of mainBackupKeys) {
      const metadataKey = `${key}_metadata`;
      const metadata = await redisClient.get(metadataKey);
      
      if (metadata) {
        const meta = JSON.parse(metadata);
        console.log(`Key: ${key}`);
        console.log(`  Timestamp: ${meta.timestamp}`);
        console.log(`  Products: ${meta.totalProducts}`);
        console.log(`  Store: ${meta.storeUrl}`);
        console.log("");
      } else {
        console.log(`Key: ${key} (no metadata available)`);
        console.log("");
      }
    }

    return mainBackupKeys;

  } catch (error) {
    console.error("Error listing backups:", error.message);
    throw error;
  } finally {
    await redisClient.disconnect();
  }
}

// Export a backup to a JSON file
async function exportBackupToFile(backupKey, outputPath) {
  try {
    await redisClient.connect();
    console.log("Connected to Redis\n");

    const backupData = await redisClient.get(backupKey);
    
    if (!backupData) {
      console.error(`Backup key "${backupKey}" not found in Redis.`);
      return;
    }

    fs.writeFileSync(outputPath, backupData, "utf-8");
    
    const products = JSON.parse(backupData);
    console.log(`✓ Backup exported successfully!`);
    console.log(`✓ File: ${outputPath}`);
    console.log(`✓ Products: ${products.length}`);

  } catch (error) {
    console.error("Error exporting backup:", error.message);
    throw error;
  } finally {
    await redisClient.disconnect();
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === "--list") {
    // List all backups
    await listBackups();
  } else if (args[0] === "--export" && args.length >= 2) {
    // Export a specific backup to JSON file
    const backupKey = args[1];
    const outputPath = args[2] || `${backupKey}.json`;
    await exportBackupToFile(backupKey, outputPath);
  } else {
    console.log("Redis Backup Manager\n");
    console.log("Usage:");
    console.log("  node restore-products-from-redis.js --list");
    console.log("  node restore-products-from-redis.js --export <backup_key> [output_file.json]");
    console.log("\nExamples:");
    console.log("  node restore-products-from-redis.js --list");
    console.log("  node restore-products-from-redis.js --export wc_products_backup_2025-10-22T10-30-00-000Z");
    console.log("  node restore-products-from-redis.js --export wc_products_backup_2025-10-22T10-30-00-000Z my_backup.json");
  }
}

main().catch((error) => {
  console.error("Process failed:", error);
  process.exit(1);
});
