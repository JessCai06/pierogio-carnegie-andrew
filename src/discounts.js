// ...existing code...
/**
 * Calculate discounts for an order
 *
 * @param {Object} order - The order object
 * @param {Object} profile - Customer profile with tier property
 * @param {string|null} couponCode - Optional coupon code
 * @returns {number} - Total discount amount in cents (positive number)
 */
function discounts(order, profile, couponCode = null) {
  let totalDiscount = 0;

  // Volume pricing discounts
  const volumeDiscounts = {
    guest: { 12: 0.05, 24: 0.10 },
    regular: { 12: 0.08, 24: 0.12 },
    vip: { 12: 0.05, 24: 0.10 }
  };

  const tierDiscounts = (profile && profile.tier && volumeDiscounts[profile.tier]) ? volumeDiscounts[profile.tier] : volumeDiscounts.guest;

  for (const item of order.items || []) {
    const itemSubtotal = item.unitPriceCents * item.qty;
    if (item.qty >= 24 && tierDiscounts[24]) {
      totalDiscount += Math.floor(itemSubtotal * tierDiscounts[24]);
    } else if (item.qty >= 12 && tierDiscounts[12]) {
      totalDiscount += Math.floor(itemSubtotal * tierDiscounts[12]);
    }
  }

  // Coupon discounts
  if (couponCode) {
    totalDiscount += applyCoupon(couponCode, order);
  }

  return totalDiscount;
}

/**
 * Apply coupon discount
 * @param {string} code - Coupon code
 * @param {Object} order - The order object
 * @returns {number} - Discount amount in cents (positive)
 */
function applyCoupon(code, order) {
  if (!order || !Array.isArray(order.items)) return 0;

  if (code === 'PIEROGI-BOGO') {
    // BOGO applies only when there are at least two 6-pack items of the same filling.
    const sixPacksByFilling = {};
    for (const item of order.items) {
      if (item.qty === 6) {
        const fill = item.filling || '__unknown__';
        sixPacksByFilling[fill] = sixPacksByFilling[fill] || [];
        sixPacksByFilling[fill].push(item);
      }
    }

    // Only apply when there's at least one filling group with 2+ six-packs
    for (const filling in sixPacksByFilling) {
      const list = sixPacksByFilling[filling];
      if (list.length >= 2) {
        // 50% off one 6-pack: choose the cheapest eligible pack to compute discount conservatively
        const prices = list.map((it) => it.unitPriceCents * it.qty).sort((a, b) => a - b);
        return Math.floor(prices[0] * 0.5);
      }
    }
    return 0;
  }

  if (code === 'FIRST10') {
    let discount = -0.10;
    let subtotal = 0;
    for (const item of order.items) {
      subtotalAmt += item.unitPriceCents * item.qty;
    }
    if (subtotalAmt >= 2000) {
      return Math.floor(subtotalAmt * 0.10);
    }
    return Math.floor(subtotal * discount);
  }

  return 0;
}

module.exports = { discounts };
