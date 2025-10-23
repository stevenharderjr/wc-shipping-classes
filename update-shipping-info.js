import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import { extractRelevantProductData, validateProductUpdateData, sleep, needsShippingUpdate } from "./utils.js";

dotenv.config();

const WC_API_BASE = `${process.env.WC_STORE_URL}/wp-json/wc/v3`;
const AUTH = {
  username: process.env.WC_CONSUMER_KEY,
  password: process.env.WC_CONSUMER_SECRET,
};

const DEEP_SEEK_KEY = process.env.DEEP_SEEK_KEY;
const AI_PROMPT = fs.readFileSync("./ai_prompt.md", "utf8");

// Configuration
const RATE_LIMIT_DELAY = 1000; // 1 second between WooCommerce updates (configurable)
const MAX_RETRIES = 3; // Maximum number of retries for failed API calls
const RETRY_DELAY_BASE = 2000; // Base delay for exponential backoff (2 seconds)
const VALIDATION_OPTIONS = {
  maxWeight: 1000, // Maximum weight in your units (pounds/kg)
  maxDimension: 500, // Maximum dimension in your units (inches/cm)
  minDimension: 0.01, // Minimum dimension to prevent zero values
  validShippingClassIds: null, // Set to array of valid IDs if you want to restrict, e.g., [12, 13, 14]
};

// Setup logging
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const logsDir = path.join(process.cwd(), "logs");
const logFilePath = path.join(logsDir, `update-log_${timestamp}.json`);
const changeLog = [];

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Log a change to the change log array and file
 */
function logChange(entry) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  changeLog.push(logEntry);
  
  // Append to file immediately for real-time logging
  fs.appendFileSync(logFilePath, JSON.stringify(logEntry, null, 2) + ',\n', 'utf-8');
}

// Parse command line arguments
const args = process.argv.slice(2);
let PRODUCT_LIMIT = null; // Process all products by default
let SKIP_PRE_VALIDATION = false; // Skip pre-validation of existing products by default

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    PRODUCT_LIMIT = parseInt(args[i + 1], 10);
    if (isNaN(PRODUCT_LIMIT) || PRODUCT_LIMIT <= 0) {
      console.error('Error: --limit must be a positive number');
      process.exit(1);
    }
    console.log(`📊 Limit set: Will process maximum ${PRODUCT_LIMIT} product(s)\n`);
  }
  if (args[i] === '--reevaluate') {
    SKIP_PRE_VALIDATION = true;
    console.log(`🔄 Re-evaluate mode: All products will be processed regardless of existing shipping data\n`);
  }
}

// Fetch paginated products from WooCommerce
async function fetchProducts(page = 1, per_page = 10) {
  const response = await axios.get(`${WC_API_BASE}/products`, {
    auth: AUTH,
    params: { per_page, page },
  });
  return response.data;
}

// Query DeepSeek AI with product data and prompt (with retry logic)
async function queryDeepSeekAI(productFilteredData, retries = 0) {
  const userPrompt = `Product Data:\n${JSON.stringify(productFilteredData, null, 2)}\nRespond strictly with the updated shipping JSON output only.`;

  try {
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: AI_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEP_SEEK_KEY}`,
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    if (retries < MAX_RETRIES) {
      const delay = RETRY_DELAY_BASE * Math.pow(2, retries); // Exponential backoff
      console.warn(`⚠️  AI request failed, retrying in ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})...`);
      await sleep(delay);
      return queryDeepSeekAI(productFilteredData, retries + 1);
    }
    throw error;
  }
}

// Update WooCommerce product with shipping info (with retry logic)
async function updateProduct(productUpdate, originalProduct, retries = 0) {
  // Validate AI-generated data (throwOnError = true)
  const { warnings } = validateProductUpdateData(productUpdate, VALIDATION_OPTIONS, true);
  
  // Log any warnings
  if (warnings.length > 0) {
    console.warn(`⚠️  Warnings for product ${productUpdate.id}:`, warnings.join(', '));
  }

  const updatePayload = {
    shipping_class_id: productUpdate.shipping_class_id,
    dimensions: productUpdate.dimensions,
  };
  if (productUpdate.weight) {
    updatePayload.weight = productUpdate.weight;
  }

  try {
    const response = await axios.put(
      `${WC_API_BASE}/products/${productUpdate.id}`,
      updatePayload,
      { auth: AUTH }
    );

    // Log successful update
    logChange({
      status: 'success',
      productId: productUpdate.id,
      productName: originalProduct.name,
      before: {
        shipping_class: originalProduct.shipping_class,
        weight: originalProduct.weight,
        dimensions: originalProduct.dimensions,
      },
      after: {
        shipping_class_id: productUpdate.shipping_class_id,
        weight: productUpdate.weight,
        dimensions: productUpdate.dimensions,
      },
      rationale: productUpdate.rationale, // Include AI rationale
      warnings: warnings.length > 0 ? warnings : undefined,
    });

    return response.data;
  } catch (error) {
    if (retries < MAX_RETRIES) {
      const delay = RETRY_DELAY_BASE * Math.pow(2, retries); // Exponential backoff
      console.warn(`⚠️  Update failed, retrying in ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})...`);
      await sleep(delay);
      return updateProduct(productUpdate, originalProduct, retries + 1);
    }
    
    // Log failed update
    logChange({
      status: 'failed',
      productId: productUpdate.id,
      productName: originalProduct.name,
      error: error.message,
      attempted: updatePayload,
    });
    
    throw error;
  }
}

// Main orchestrator function
async function main() {
  let page = 1;
  let products;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalFiltered = 0; // Products skipped because they already have shipping info
  const failedProducts = []; // Track failed products for summary

  console.log(`📝 Log file: ${logFilePath}\n`);

  try {
    do {
      products = await fetchProducts(page);
      console.log(`Fetched ${products.length} products on page ${page}`);

      for (const product of products) {
        // Check if we've reached the product limit
        if (PRODUCT_LIMIT && totalProcessed >= PRODUCT_LIMIT) {
          console.log(`\n🛑 Reached product limit of ${PRODUCT_LIMIT}. Stopping.`);
          products = []; // Break out of outer loop
          break;
        }

        // Check if product needs shipping update (validates existing data)
        // Skip this check if --skip-validation flag is set
        if (!SKIP_PRE_VALIDATION) {
          const { needsUpdate, reasons } = needsShippingUpdate(product, VALIDATION_OPTIONS);
          
          if (!needsUpdate) {
            console.log(`⏭️  Skipping product ID ${product.id} - ${product.name} (has valid shipping info)`);
            totalFiltered++;
            continue;
          }
          
          console.log(`   Reasons: ${reasons.join(', ')}`);
        }

        const relevantData = extractRelevantProductData(product);
        console.log(`\n📦 Processing product ID ${product.id} - ${product.name}`);
        totalProcessed++;

        try {
          // Track total processing time for rate limiting
          const processingStartTime = Date.now();
          
          // Query AI for shipping data update
          const aiResponseText = await queryDeepSeekAI(relevantData);

          // Parse AI JSON response
          let aiResponseJson;
          try {
            // Strip markdown code blocks if present (AI sometimes wraps JSON in ```json ... ```)
            let cleanedResponse = aiResponseText.trim();
            if (cleanedResponse.startsWith('```')) {
              // Remove opening ```json or ``` and closing ```
              cleanedResponse = cleanedResponse
                .replace(/^```(?:json)?\s*\n?/, '')
                .replace(/\n?```\s*$/, '');
            }
            
            aiResponseJson = JSON.parse(cleanedResponse);
          } catch (parseErr) {
            console.error(`❌ Parsing AI response failed for product ${product.id}:`, parseErr.message);
            logChange({
              status: 'failed',
              productId: product.id,
              productName: product.name,
              error: `AI parsing failed: ${parseErr.message}`,
              aiResponse: aiResponseText.substring(0, 500), // Log first 500 chars
            });
            totalFailed++;
            failedProducts.push({ id: product.id, name: product.name, reason: 'AI parsing failed' });
            continue;
          }

          // Update WooCommerce product site
          try {
            const updatedProduct = await updateProduct(aiResponseJson, product);
            console.log(`✅ Product ${updatedProduct.id} updated successfully.`);
            if (aiResponseJson.rationale) {
              console.log(`   💡 Rationale: ${aiResponseJson.rationale}`);
            }
            totalUpdated++;
            
            // Rate limiting: only delay if not enough time has passed
            const processingElapsedTime = Date.now() - processingStartTime;
            const remainingDelay = RATE_LIMIT_DELAY - processingElapsedTime;
            if (remainingDelay > 0) {
              await sleep(remainingDelay);
            }
          } catch (updateErr) {
            console.error(`❌ Failed to update product ${product.id}:`, updateErr.message);
            totalFailed++;
            failedProducts.push({ id: product.id, name: product.name, reason: updateErr.message });
          }
        } catch (validationErr) {
          console.error(`⚠️  Validation failed for product ${product.id}:`, validationErr.message);
          console.error(`   Skipping this product due to invalid data.`);
          logChange({
            status: 'skipped',
            productId: product.id,
            productName: product.name,
            error: `Validation failed: ${validationErr.message}`,
          });
          totalSkipped++;
        }
      }

      page++;
    } while (products.length > 0);

    // Finalize log file (wrap in array brackets) - only if file exists
    if (fs.existsSync(logFilePath)) {
      const logContent = fs.readFileSync(logFilePath, 'utf-8');
      const finalLog = '[\n' + logContent.slice(0, -2) + '\n]'; // Remove trailing comma and wrap
      fs.writeFileSync(logFilePath, finalLog, 'utf-8');
    } else {
      // Create empty log array if no entries were written
      fs.writeFileSync(logFilePath, '[]', 'utf-8');
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("PROCESSING SUMMARY");
    console.log("=".repeat(60));
    if (PRODUCT_LIMIT) {
      console.log(`Limit: ${PRODUCT_LIMIT} product(s)`);
    }
    console.log(`Total products fetched: ${totalProcessed + totalFiltered}`);
    console.log(`⏭️  Filtered (already complete): ${totalFiltered}`);
    console.log(`📦 Processed (needed update): ${totalProcessed}`);
    console.log(`✅ Successfully updated: ${totalUpdated}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log(`⚠️  Skipped (validation): ${totalSkipped}`);
    
    if (failedProducts.length > 0) {
      console.log("\n❌ Failed Products:");
      failedProducts.forEach(p => {
        console.log(`   - ID ${p.id}: ${p.name} (${p.reason})`);
      });
    }
    
    console.log(`\n📝 Detailed log saved to: ${logFilePath}`);
    console.log("=".repeat(60));

  } catch (err) {
    console.error("\n❌ Error in main process:", err);
  }
}

main();
