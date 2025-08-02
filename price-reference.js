// Price Reference System for Merchandise Tracker
// This file contains all pricing information for accurate profit calculations

const PRICE_REFERENCE = {
    // ISKOLEHIYO T-SHIRTS
    'ISKOLEHIYO T-SHIRT V1.1': {
        basePrice: 350,
        sizePricing: {
            'S': 350,
            'M': 350,
            'L': 350,
            'XL': 350,
            '2XL': 450, // base + 100
            '3XL': 450, // base + 100
            '4XL': 500, // base + 150
            '5XL': 500  // base + 150
        },
        category: 't-shirt',
        brand: 'ISKOLEHIYO'
    },
    'ISKOLEHIYO T-SHIRT V1.2': {
        basePrice: 350,
        sizePricing: {
            'S': 350,
            'M': 350,
            'L': 350,
            'XL': 350,
            '2XL': 450, // base + 100
            '3XL': 450, // base + 100
            '4XL': 500, // base + 150
            '5XL': 500  // base + 150
        },
        category: 't-shirt',
        brand: 'ISKOLEHIYO'
    },
    'ISKOLEHIYO T-SHIRT V1.3': {
        basePrice: 350,
        sizePricing: {
            'S': 350,
            'M': 350,
            'L': 350,
            'XL': 350,
            '2XL': 450, // base + 100
            '3XL': 450, // base + 100
            '4XL': 500, // base + 150
            '5XL': 500  // base + 150
        },
        category: 't-shirt',
        brand: 'ISKOLEHIYO'
    },
    
    // ISKOLEHIYO TOTE BAGS
    'ISKOLEHIYO TOTE BAG V1.1': {
        basePrice: 250,
        sizePricing: {
            'ONE_SIZE': 250
        },
        category: 'tote-bag',
        brand: 'ISKOLEHIYO'
    },
    'ISKOLEHIYO TOTE BAG V1.2': {
        basePrice: 250,
        sizePricing: {
            'ONE_SIZE': 250
        },
        category: 'tote-bag',
        brand: 'ISKOLEHIYO'
    },
    
    // ACCESSORIES
    'AIRPLANE PIN': {
        basePrice: 45,
        sizePricing: {
            'ONE_SIZE': 45
        },
        category: 'accessory',
        brand: 'ISKOLEHIYO'
    },
    'REMOVE BEFORE FLIGHT TAG': {
        basePrice: 45,
        sizePricing: {
            'ONE_SIZE': 45
        },
        category: 'accessory',
        brand: 'ISKOLEHIYO'
    },
    
    // PAGLAOM T-SHIRTS
    'PAGLAOM V1.1 T-SHIRT': {
        basePrice: 400,
        sizePricing: {
            'S': 400,
            'M': 400,
            'L': 400,
            'XL': 400,
            '2XL': 500, // base + 100
            '3XL': 500, // base + 100
            '4XL': 550, // base + 150
            '5XL': 550  // base + 150
        },
        category: 't-shirt',
        brand: 'PAGLAOM'
    },
    'PAGLAOM V1.2 T-SHIRT': {
        basePrice: 350,
        sizePricing: {
            'S': 350,
            'M': 350,
            'L': 350,
            'XL': 350,
            '2XL': 450, // base + 100
            '3XL': 450, // base + 100
            '4XL': 500, // base + 150
            '5XL': 500  // base + 150
        },
        category: 't-shirt',
        brand: 'PAGLAOM'
    },
    
    // HIRONO STICKERS
    'Hirono Airplane Sticker': {
        basePrice: 30,
        sizePricing: {
            'ONE_SIZE': 30
        },
        category: 'sticker',
        brand: 'HIRONO'
    },
    'Hirono Computer Enthusiasts Sticker': {
        basePrice: 30,
        sizePricing: {
            'ONE_SIZE': 30
        },
        category: 'sticker',
        brand: 'HIRONO'
    },
    'Hirono Uniform Sticker': {
        basePrice: 30,
        sizePricing: {
            'ONE_SIZE': 30
        },
        category: 'sticker',
        brand: 'HIRONO'
    },
    
    // STICKER SETS
    'Sticker Set A': {
        basePrice: 80,
        sizePricing: {
            'ONE_SIZE': 80
        },
        category: 'sticker-set',
        brand: 'HIRONO'
    },
    'Sticker Set B': {
        basePrice: 100,
        sizePricing: {
            'ONE_SIZE': 100
        },
        category: 'sticker-set',
        brand: 'HIRONO'
    }
};

// Helper function to extract size from item name
function extractSizeFromItemName(itemName) {
    const sizeMatch = itemName.match(/\(([^)]+)\)/);
    if (sizeMatch) {
        const size = sizeMatch[1].replace(/Size:\s*/i, '').trim().toUpperCase();
        // Validate if it's a recognized size
        if (['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'].includes(size)) {
            return size;
        }
    }
    return 'ONE_SIZE'; // Default for items without size or unrecognized sizes
}

// Helper function to get base item name (without size)
function getBaseItemName(itemName) {
    return itemName.replace(/\s*\([^)]*\)/g, '').replace(/,?\s*$/, '').trim();
}

// Function to get the correct price for an item
function getItemPrice(itemName) {
    const baseName = getBaseItemName(itemName);
    const size = extractSizeFromItemName(itemName);
    
    // Find the item in our price reference
    for (const [key, pricing] of Object.entries(PRICE_REFERENCE)) {
        if (baseName.toUpperCase().includes(key.toUpperCase()) || key.toUpperCase().includes(baseName.toUpperCase())) {
            return pricing.sizePricing[size] || pricing.basePrice;
        }
    }
    
    // If not found, return 0 (this will help identify missing items)
    console.warn(`Price not found for item: ${itemName}`);
    return 0;
}

// Function to calculate profit for an order
function calculateOrderProfit(order) {
    const itemPrice = getItemPrice(order.itemName);
    const quantity = order.quantity || 1;
    const sellingPrice = order.price || 0;
    
    const totalCost = itemPrice * quantity;
    const totalRevenue = sellingPrice * quantity;
    const profit = totalRevenue - totalCost;
    
    return {
        itemPrice: itemPrice,
        quantity: quantity,
        totalCost: totalCost,
        totalRevenue: totalRevenue,
        profit: profit,
        profitMargin: totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0
    };
}

// Function to get all items with their pricing information
function getAllPricedItems() {
    return Object.entries(PRICE_REFERENCE).map(([name, pricing]) => ({
        name: name,
        basePrice: pricing.basePrice,
        sizes: Object.keys(pricing.sizePricing),
        category: pricing.category,
        brand: pricing.brand,
        pricing: pricing.sizePricing
    }));
}

// Function to validate if an item exists in our price reference
function isItemInPriceReference(itemName) {
    const baseName = getBaseItemName(itemName);
    return Object.keys(PRICE_REFERENCE).some(key => 
        baseName.toUpperCase().includes(key.toUpperCase()) || 
        key.toUpperCase().includes(baseName.toUpperCase())
    );
}

// Function to get missing items (items not in price reference)
function getMissingItems(orders) {
    const missingItems = new Set();
    
    orders.forEach(order => {
        const items = order.itemName.split(/\n|,/).map(item => item.trim()).filter(Boolean);
        items.forEach(item => {
            const baseName = getBaseItemName(item);
            if (!isItemInPriceReference(baseName)) {
                missingItems.add(baseName);
            }
        });
    });
    
    return Array.from(missingItems);
}

// Export functions for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PRICE_REFERENCE,
        getItemPrice,
        calculateOrderProfit,
        getAllPricedItems,
        isItemInPriceReference,
        getMissingItems,
        extractSizeFromItemName,
        getBaseItemName
    };
} 