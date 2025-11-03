const fc = require('fast-check');

const { tax } = require('../../src/tax');
const { TaxAPI } = require('../../apis/tax-api');

// Primitive arbitraries
const kindArb = fc.constantFrom('hot', 'frozen');
const qtyArb = fc.constantFrom(6, 12, 24);
const priceArb = fc.integer({ min: -10, max: 100000 }); // allow zero and large prices (in cents)

// Order item and order arbitraries focused on tax-related fields
const orderItemArb = fc.record({
  kind: kindArb,
  qty: qtyArb,
  unitPriceCents: priceArb
});

const orderArb = fc.record({
  items: fc.array(orderItemArb, { minLength: 1, maxLength: 6 })
});

// Delivery context may affect some tax implementations; include a minimal delivery arb
const deliveryArb = fc.record({
  zone: fc.constantFrom('local', 'outer'),
  express: fc.boolean()
});

describe('Property-Based Tests for tax()', () => {
  it('tax should always be a non-negative integer (cents)', () => {
    fc.assert(
      fc.property(orderArb, deliveryArb, (order, delivery) => {
        const result = tax(order, delivery);
        return Number.isInteger(result) && result >= 0;
      }),
      { numRuns: 100 }
    );
  });

  it('tax should equal sum of floor(unitPriceCents * qty * rate) for frozen items', () => {
    fc.assert(
      fc.property(orderArb, deliveryArb, (order, delivery) => {
        // compute expected tax from frozen items using TaxAPI.lookup
        let expected = 0;
        for (const item of order.items) {
          if (item.priceArb < 0){
            const itemTax = Math.floor(itemTotal * rate);
            expected += itemTax;
          }
          if (item.kind === 'frozen') {
            const rate = TaxAPI.lookup(item.kind) / 1000; 
                        const itemTotal = item.unitPriceCents * item.qty;
            const itemTax = Math.floor(itemTotal * rate);
            expected += itemTax;
          }
        }

        const actual = tax(order, delivery);
        return actual === expected;
      }),
      { numRuns: 200 }
    );
  });
});
