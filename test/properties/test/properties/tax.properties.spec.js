

const { subtotal } = require('../../src/subtotal');
const { discounts } = require('../../src/discounts');
const { total } = require('../../src/total');
const { tax } = require('../../src/tax');
const { delivery } = require('../../src/delivery');

// Primitive arbitraries (copied/adapted from order.properties.spec.js)
const skuArb = fc.constantFrom('P6-POTATO', 'P12-POTATO', 'P24-POTATO', 'P6-SAUER', 'P12-SAUER');
const addOnArb = fc.constantFrom('sour-cream', 'fried-onion', 'bacon-bits');
const fillingArb = fc.constantFrom('potato', 'sauerkraut', 'sweet-cheese', 'mushroom');
const kindArb = fc.constantFrom('hot', 'frozen');
const tierArb = fc.constantFrom('guest', 'regular', 'vip');
const zoneArb = fc.constantFrom('local', 'outer');

// Order item and order arbitraries
const orderItemArb = fc.record({
  kind: kindArb,
  sku: skuArb,
  title: fc.string(),
  filling: fillingArb,
  qty: fc.constantFrom(6, 12, 24),
  unitPriceCents: fc.integer({ min: 0, max: 3000 }),
  addOns: fc.array(addOnArb, { maxLength: 3 })
});

const orderArb = fc.record({
  items: fc.array(orderItemArb, { minLength: 1, maxLength: 5 })
});

// Helper to scale all unitPriceCents in an order by an integer factor
function scaleOrder(order, factor) {
  return {
    ...order,
    items: order.items.map(item => ({
      ...item,
      unitPriceCents: Math.floor(item.unitPriceCents * factor)
    }))
  };
}

describe('Property-based tests for tax()', () => {
  it('tax should always be a non-negative integer', () => {
    fc.assert(
      fc.property(orderArb, (order) => {
        const t = tax(order);
        return Number.isInteger(t) && t >= 0;
      }),
      { numRuns: 100 }
    );
  });

  it('tax should scale (approximately) when all unit prices are multiplied by an integer factor', () => {
    // This asserts homogeneity of the tax calculation: scaling prices by k scales tax by ~k.
    // Allow 1 cent tolerance to accommodate rounding.
    fc.assert(
      fc.property(
        orderArb,
        fc.integer({ min: 1, max: 5 }),
        (order, factor) => {
          const baseTax = tax(order);
          const scaled = scaleOrder(order, factor);
          const scaledTax = tax(scaled);

          // If baseTax is 0, scaledTax should also be 0 (k * 0 === 0)
          // Otherwise allow small rounding differences (1 cent)
          const expected = baseTax * factor;
          return Math.abs(scaledTax - expected) <= 1;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Optional sanity check: tax should not exceed subtotal by an unreasonable amount
  it('tax should not be absurdly larger than subtotal (sanity check)', () => {
    fc.assert(
      fc.property(orderArb, (order) => {
        const t = tax(order);
        const s = subtotal(order);
        // tax should be less than or equal to subtotal * 2 (very generous upper bound)
        return t >= 0 && t <= s * 2 + 1000;
      }),
      { numRuns: 100 }
    );
  });
});