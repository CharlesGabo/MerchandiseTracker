# Merchandise Tracker - Price Reference System

This system provides accurate profit calculations for merchandise tracking by maintaining a comprehensive price reference for all items.

## Features

### Price Reference System
- **Comprehensive Pricing**: All merchandise items with their base prices and size-based pricing
- **Profit Analysis**: Automatic calculation of profit margins per item
- **Missing Item Detection**: Identifies items not in the price reference
- **Size-based Pricing**: Handles different pricing for t-shirt sizes (2XL-3XL: +₱100, 4XL-5XL: +₱150)

### Items Included

#### ISKOLEHIYO Collection
- **T-Shirts V1.1, V1.2, V1.3**: ₱350 base price
- **Tote Bags V1.1, V1.2**: ₱250
- **Airplane Pin**: ₱45
- **Remove Before Flight Tag**: ₱45

#### PAGLAOM Collection
- **V1.1 T-Shirt**: ₱400 base price
- **V1.2 T-Shirt**: ₱350 base price

#### HIRONO Collection
- **Individual Stickers**: ₱30 each
  - Airplane Sticker
  - Computer Enthusiasts Sticker
  - Uniform Sticker
- **Sticker Sets**: 
  - Set A: ₱80
  - Set B: ₱100

## Size Pricing Guide

### T-Shirts
- **S, M, L, XL**: Base price
- **2XL, 3XL**: Base price + ₱100
- **4XL, 5XL**: Base price + ₱150

### Other Items
- **Tote Bags**: One size fits all
- **Pins & Tags**: One size
- **Stickers**: One size

## Files

- `price-reference.js`: Contains all pricing data and calculation functions
- `financial-summary.html`: Updated with accurate pricing in monthly breakdown
- `index.html`: Main order tracking interface

## Usage

1. **Monthly Breakdown**: Check the Financial Summary page to see accurate pricing and profit calculations in the monthly breakdown
2. **Profit Tracking**: Each transaction shows the selling price, base cost, and profit
3. **Missing Items**: The system will alert you to any items not in the price reference

## Functions Available

- `getItemPrice(itemName)`: Get the correct price for an item
- `calculateOrderProfit(order)`: Calculate profit for an order
- `getMissingItems(orders)`: Find items not in the price reference
- `isItemInPriceReference(itemName)`: Check if an item exists in the reference

## Adding New Items

To add new items to the price reference, edit the `PRICE_REFERENCE` object in `price-reference.js`:

```javascript
'NEW ITEM NAME': {
    basePrice: 300,
    sizePricing: {
        'S': 300,
        'M': 300,
        'L': 300,
        'XL': 300,
        '2XL': 400, // base + 100
        '3XL': 400, // base + 100
        '4XL': 450, // base + 150
        '5XL': 450  // base + 150
    },
    category: 't-shirt', // or 'tote-bag', 'accessory', 'sticker', 'sticker-set'
    brand: 'BRAND_NAME'
}
``` 