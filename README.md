# README.md

## WooCommerce Shipping Classes and Dynamic Product Packaging Updater

### Overview

This application dynamically updates WooCommerce products by assigning appropriate shipping classes and package dimensions (length, width, height) based on an AI evaluation of relevant product data. The goal is to automate optimal box sizing and shipping classification for all products, improving accuracy of shipping cost calculations for Easyship integration.

---

### Shipping Classes

This repository uses the following fixed shipping classes created in WooCommerce to categorize products by size and weight for shipping purposes:

| Shipping Class     | Slug               | Description                                           | WooCommerce Shipping Class ID |
|--------------------|--------------------|-------------------------------------------------------|-------------------------------|
| Small Envelope     | small-envelope     | Small lightweight padded envelope, under 0.5 lbs, tablets | 145                           |
| Medium Box         | medium-box         | Medium box for packages between 0.5 and 2 lbs         | 146                           |
| Large Box          | large-box          | Large box for packages between 2 and 10 lbs           | 147                           |
| Extra Large Box    | extra-large-box    | Extra-large box for packages exceeding 10 lbs         | 148                           |

---

### Application Goals

- **Fetch all WooCommerce products** via the WooCommerce REST API.  
- **Analyze product data fields** relevant for shipping classification and dimension estimation.  
- **Assign shipping classes and update package dimensions** (length, width, height) dynamically per product.  
- Update the WooCommerce store by sending the optimized shipping class ID and product box dimensions via API.

This automation supports accurate shipping quotes and packaging decisions, specifically designed for your Easyship integration.

---

### Relevant Product Data Fields

Based on review of a sample product JSON, the following fields are central to the AI evaluation and updates:

- **`weight`** (string): Product weight in pounds or kilograms, used as the primary metric for size estimation.  
- **`dimensions`** (object): Contains the three dimension fields —  
  - `length` (string)  
  - `width` (string)  
  - `height` (string)  
  These may initially be empty but are populated by the application based on weight and product type logic.  
- **`shipping_class_id`** (integer): Numerical ID of the assigned shipping class, indicating the product's shipping category in WooCommerce.  
- **`meta_data`** (array of key-value pairs): May contain product-specific custom fields or overrides related to shipping, package size, or special handling instructions. Recommended to check and update if your store uses these for packaging data.

---

### How to Use This Repository

1. Ensure your WooCommerce API credentials are stored securely in a `.env` file.  
2. Run the scripts to create shipping classes if not yet present (IDs 145-148 as above).  
3. Run the main updater script that:  
   - Fetches all products  
   - Performs AI-driven weight and description analysis  
   - Calculates box dimensions based on predefined thresholds  
   - Applies shipping class ID and updates product dimensions accordingly via WooCommerce REST API  
4. Verify shipping classes and package dimensions in WooCommerce admin and Easyship settings.

---

### Notes

- The shipping class IDs (145-148) must correspond accurately to the shipping classes created in your WooCommerce store. If different, update the scripts accordingly.  
- The AI evaluation focuses narrowly on `weight`, `dimensions`, and optional shipping metadata—not the entire product JSON—to ensure efficient and precise updates.  
- Default packaging sizes (e.g., small padded envelope for weights under 0.5 lbs) prevent overestimating shipments and help maintain shipping cost control.

---

This repository empowers streamlined logistics by leveraging WooCommerce and Easyship integration intelligently with minimal manual product data editing.