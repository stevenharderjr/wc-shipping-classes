import fs from "fs";
import path from "path";

// List all available backups
function listBackups() {
  const backupsDir = path.join(process.cwd(), "backups");
  
  if (!fs.existsSync(backupsDir)) {
    console.log("No backups directory found.");
    return [];
  }

  const backupFiles = fs.readdirSync(backupsDir)
    .filter(file => file.startsWith("products_backup_") && file.endsWith(".json"))
    .sort()
    .reverse();

  if (backupFiles.length === 0) {
    console.log("No backups found in the backups directory.");
    return [];
  }

  console.log(`Found ${backupFiles.length} backup(s):\n`);

  backupFiles.forEach((file, index) => {
    const filePath = path.join(backupsDir, file);
    const stats = fs.statSync(filePath);
    
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const metadata = data.metadata || {};
      
      console.log(`${index + 1}. ${file}`);
      console.log(`   Date: ${metadata.backupDate || 'Unknown'}`);
      console.log(`   Products: ${metadata.totalProducts || data.products?.length || 'Unknown'}`);
      console.log(`   Store: ${metadata.storeUrl || 'Unknown'}`);
      console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log("");
    } catch (error) {
      console.log(`${index + 1}. ${file} (Error reading metadata)`);
      console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log("");
    }
  });

  return backupFiles;
}

// Display details of a specific backup
function showBackupDetails(filename) {
  const backupsDir = path.join(process.cwd(), "backups");
  const filePath = path.join(backupsDir, filename);

  if (!fs.existsSync(filePath)) {
    console.error(`Backup file "${filename}" not found.`);
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const metadata = data.metadata || {};
    const products = data.products || [];

    console.log("\n=== Backup Details ===");
    console.log(`File: ${filename}`);
    console.log(`Date: ${metadata.backupDate || 'Unknown'}`);
    console.log(`Store: ${metadata.storeUrl || 'Unknown'}`);
    console.log(`Total Products: ${metadata.totalProducts || products.length}`);
    console.log(`File Size: ${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)} MB`);
    
    if (products.length > 0) {
      console.log("\nFirst 5 products:");
      products.slice(0, 5).forEach((product, index) => {
        console.log(`  ${index + 1}. ID: ${product.id} - ${product.name}`);
      });
    }
  } catch (error) {
    console.error("Error reading backup file:", error.message);
  }
}

// Export products from backup to a new file
function exportProducts(backupFilename, outputFilename) {
  const backupsDir = path.join(process.cwd(), "backups");
  const inputPath = path.join(backupsDir, backupFilename);

  if (!fs.existsSync(inputPath)) {
    console.error(`Backup file "${backupFilename}" not found.`);
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
    const products = data.products || [];

    fs.writeFileSync(outputFilename, JSON.stringify(products, null, 2), "utf-8");
    
    console.log(`✓ Exported ${products.length} products to ${outputFilename}`);
    console.log(`✓ File size: ${(fs.statSync(outputFilename).size / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.error("Error exporting products:", error.message);
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === "--list") {
    // List all backups
    listBackups();
  } else if (args[0] === "--details" && args.length >= 2) {
    // Show details of a specific backup
    const filename = args[1];
    showBackupDetails(filename);
  } else if (args[0] === "--export" && args.length >= 2) {
    // Export products from a backup to a new file
    const backupFilename = args[1];
    const outputFilename = args[2] || `exported_products_${Date.now()}.json`;
    exportProducts(backupFilename, outputFilename);
  } else {
    console.log("Backup Manager\n");
    console.log("Usage:");
    console.log("  node restore-products.js --list");
    console.log("  node restore-products.js --details <backup_filename>");
    console.log("  node restore-products.js --export <backup_filename> [output_file.json]");
    console.log("\nExamples:");
    console.log("  node restore-products.js --list");
    console.log("  node restore-products.js --details products_backup_2025-10-22T10-30-00-000Z.json");
    console.log("  node restore-products.js --export products_backup_2025-10-22T10-30-00-000Z.json restored.json");
  }
}

main();
