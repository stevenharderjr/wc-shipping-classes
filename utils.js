// utils.js

/**
 * Extract relevant fields from WooCommerce product object for AI processing
 * @param {Object} product - Full WooCommerce product JSON object
 * @returns {Object} filtered product object with only relevant info
 */
function extractRelevantProductData(product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    weight: product.weight,
    dimensions: product.dimensions,
    categories: product.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug
    })),
    attributes: product.attributes.map(attr => ({
      id: attr.id,
      name: attr.name,
      options: attr.options, // usually an array of selected attribute values
    })),
  };
}


/**
 * Validate product shipping data with sanity checks
 * Can be used for both AI-generated updates and existing product data
 * @param {Object} data - Product data with shipping fields
 * @param {Object} options - Validation options and thresholds
 * @param {boolean} throwOnError - If true, throws error on validation failure. If false, returns result object
 * @returns {Object|Array} - If throwOnError is false, returns {isValid, errors, warnings}. Otherwise returns warnings array
 */
function validateProductUpdateData(data, options = {}, throwOnError = true) {
  const {
    maxWeight = 3200, // Max weight in pounds (or your unit)
    minWeight = 1, // Min weight to prevent zero/negative
    maxDimension = 36, // Max dimension in inches (or your unit)
    minDimension = 1, // Min dimension to prevent zero/negative
    validShippingClassIds = null, // Array of valid shipping class IDs (null = skip check)
  } = options;

  const errors = [];
  const warnings = [];

  // Required field checks
  if (!data) {
    const error = 'No product data provided';
    if (throwOnError) throw new Error(error);
    return { isValid: false, errors: [error], warnings };
  }
  if (typeof data.id !== 'number') {
    const error = 'Product ID (number) is missing or invalid';
    if (throwOnError) throw new Error(error);
    return { isValid: false, errors: [error], warnings };
  }

  // Check for shipping_class or shipping_class_id
  const shippingClassId = data.shipping_class_id ?? (data.shipping_class ? null : undefined);
  
  if (shippingClassId === undefined || shippingClassId === null || shippingClassId === '') {
    errors.push('shipping_class_id is missing or empty');
  } else if (typeof shippingClassId !== 'number') {
    errors.push('shipping_class_id must be a number');
  } else if (validShippingClassIds && !validShippingClassIds.includes(shippingClassId)) {
    errors.push(`shipping_class_id ${shippingClassId} is not in the list of valid IDs`);
  }

  // Dimensions validation with sanity checks
  if (!data.dimensions || typeof data.dimensions !== 'object') {
    errors.push('dimensions object missing or invalid');
  } else {
    const { length, width, height } = data.dimensions;
    
    // Check that dimensions are non-empty strings
    if (
      typeof length !== 'string' || length.trim() === '' ||
      typeof width !== 'string' || width.trim() === '' ||
      typeof height !== 'string' || height.trim() === ''
    ) {
      errors.push('dimensions length, width, and height must be non-empty strings');
    } else {
      // Parse and validate dimension values
      const parsedLength = parseFloat(length);
      const parsedWidth = parseFloat(width);
      const parsedHeight = parseFloat(height);

      if (isNaN(parsedLength) || isNaN(parsedWidth) || isNaN(parsedHeight)) {
        errors.push('dimensions must be valid numbers');
      } else {
        // Sanity check: dimensions should be positive
        if (parsedLength <= 0 || parsedWidth <= 0 || parsedHeight <= 0) {
          errors.push(`dimensions must be positive (got L:${parsedLength}, W:${parsedWidth}, H:${parsedHeight})`);
        }
        
        // Sanity check: dimensions shouldn't be too small
        if (parsedLength < minDimension || parsedWidth < minDimension || parsedHeight < minDimension) {
          warnings.push(`dimensions seem unusually small (L:${parsedLength}, W:${parsedWidth}, H:${parsedHeight})`);
        }
        
        // Sanity check: dimensions shouldn't exceed reasonable maximums
        if (parsedLength > maxDimension || parsedWidth > maxDimension || parsedHeight > maxDimension) {
          errors.push(`dimensions exceed maximum of ${maxDimension} (got L:${parsedLength}, W:${parsedWidth}, H:${parsedHeight})`);
        }

        // Warning for very large dimensions
        if (parsedLength > maxDimension * 0.8 || parsedWidth > maxDimension * 0.8 || parsedHeight > maxDimension * 0.8) {
          warnings.push(`dimensions are very large (L:${parsedLength}, W:${parsedWidth}, H:${parsedHeight})`);
        }
      }
    }
  }

  // Weight validation with sanity checks
  if (data.weight === undefined || data.weight === null || data.weight === '') {
    errors.push('weight is missing or empty');
  } else if (typeof data.weight !== 'string') {
    errors.push('weight must be a string');
  } else {
    const parsedWeight = parseFloat(data.weight);
    
    if (isNaN(parsedWeight)) {
      errors.push('weight must be a valid number');
    } else {
      // Sanity check: weight should be positive
      if (parsedWeight <= 0) {
        errors.push(`weight must be positive (got ${parsedWeight})`);
      }
      
      // Sanity check: weight shouldn't be below minimum
      if (parsedWeight < minWeight) {
        errors.push(`weight ${parsedWeight} is below minimum of ${minWeight}`);
      }
      
      // Sanity check: weight shouldn't exceed reasonable maximum
      if (parsedWeight > maxWeight) {
        errors.push(`weight ${parsedWeight} exceeds maximum of ${maxWeight}`);
      }

      // Warning for very heavy items
      if (parsedWeight > maxWeight * 0.8) {
        warnings.push(`weight ${parsedWeight} is very high`);
      }
    }
  }

  // If throwOnError is true, throw error if validation fails (for AI-generated data)
  if (throwOnError && errors.length > 0) {
    throw new Error(`Validation failed for product ${data.id}: ${errors.join(', ')}`);
  }

  // Return validation result (for existing product data checks)
  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * Check if a product needs shipping information update
 * Returns true if product is missing or has invalid shipping data
 * @param {Object} product - WooCommerce product object
 * @param {Object} validationOptions - Options to pass to validateProductUpdateData
 * @returns {Object} - {needsUpdate: boolean, reasons: string[]}
 */
function needsShippingUpdate(product, validationOptions = {}) {
  // Run validation without throwing errors
  const { isValid, errors, warnings } = validateProductUpdateData(product, validationOptions, false);
  
  // If validation passes, product doesn't need update
  if (isValid) {
    return { needsUpdate: false, reasons: [] };
  }
  
  // Product needs update due to validation errors
  return { needsUpdate: true, reasons: errors };
}

/**
 * Sleep utility for rate limiting
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { validateProductUpdateData, extractRelevantProductData, sleep, needsShippingUpdate };
