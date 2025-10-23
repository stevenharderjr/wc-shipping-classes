require('dotenv').config();
const axios = require('axios');

const WC_API_BASE = `${process.env.WC_STORE_URL}/wp-json/wc/v3`;
const AUTH = {
  username: process.env.WC_CONSUMER_KEY,
  password: process.env.WC_CONSUMER_SECRET,
};

const shippingClassesToCreate = [
  {
    name: 'Small Envelope',
    slug: 'small-envelope',
    description: 'Small lightweight padded envelope, under 0.5 lbs, tablets',
  },
  {
    name: 'Medium Box',
    slug: 'medium-box',
    description: 'Medium box for packages between 0.5 and 2 lbs',
  },
  {
    name: 'Large Box',
    slug: 'large-box',
    description: 'Large box for packages between 2 and 10 lbs',
  },
  {
    name: 'Extra Large Box',
    slug: 'extra-large-box',
    description: 'Extra-large box for packages exceeding 10 lbs',
  },
];

async function createShippingClass(shippingClass) {
  try {
    const response = await axios.post(
      `${WC_API_BASE}/products/shipping_classes`,
      {
        name: shippingClass.name,
        slug: shippingClass.slug,
        description: shippingClass.description,
      },
      { auth: AUTH }
    );
    console.log(`Created shipping class "${shippingClass.name}" with ID: ${response.data.id}`);
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.error(`Shipping class "${shippingClass.name}" might already exist.`);
    } else {
      console.error(`Error creating shipping class "${shippingClass.name}":`, error.message);
    }
  }
}

async function createAllShippingClasses() {
  for (const shippingClass of shippingClassesToCreate) {
    await createShippingClass(shippingClass);
  }
}

createAllShippingClasses()
  .then(() => console.log('Shipping classes creation process completed.'))
  .catch((err) => console.error('Error during shipping classes creation:', err));
