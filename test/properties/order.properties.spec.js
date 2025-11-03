const fc = require('fast-check');

const { subtotal } = require('../../src/subtotal');
const { discounts } = require('../../src/discounts');
const { total } = require('../../src/total');
const { tax } = require('../../src/tax');
const { deliveryFee } = require('../../src/delivery');

// These arbitrary generators provide primitive building blocks for constructing orders and contexts in property-based tests
//
// To learn more about primitives: https://fast-check.dev/docs/core-blocks/arbitraries/primitives
// To learn more about combiners: https://fast-check.dev/docs/core-blocks/arbitraries/combiners
const skuArb = fc.constantFrom('P6-POTATO', 'P12-POTATO', 'P24-POTATO', 'P6-SAUER', 'P12-SAUER');
const addOnArb = fc.constantFrom('sour-cream', 'fried-onion', 'bacon-bits');
const fillingArb = fc.constantFrom('potato', 'sauerkraut', 'sweet-cheese', 'mushroom');
const kindArb = fc.constantFrom('hot', 'frozen');
const tierArb = fc.constantFrom('guest', 'regular', 'vip');
const zoneArb = fc.constantFrom('local', 'outer');

const profileArb = fc.record({ tier: tierArb });
const deliveryArb = fc.record({ zone: zoneArb, rush: fc.boolean() });

// This composite arbitrary generator builds an order item object using the primitive building blocks defined above
// Each field in the object below specifies the arbitrary generator to use for that field
//
// To learn more about composite arbitraries: https://fast-check.dev/docs/core-blocks/arbitraries/composites
const orderItemArb = fc.record({
  // e.g., this will use the kindArb to generate a value for the 'kind' field
  kind: kindArb,
  sku: skuArb,
  title: fc.string(),
  filling: fillingArb,
  qty: fc.constantFrom(6, 12, 24),
  unitPriceCents: fc.integer({ min: 500, max: 3000 }),
  addOns: fc.array(addOnArb, { maxLength: 3 })
});

// We use the orderItemArb defined above to build an order object that contains an array of order items
const orderArb = fc.record({
  // we specify the maximum and minimum length of the items array here
  items: fc.array(orderItemArb, { minLength: 1, maxLength: 5 })
});


// ------------------------------------------------------------------------------
// To test discounts, tax, delivery and total, you will need to add more
// arbitraries to represent the context in which an order is placed.
//
// You will find the following building blocks helpful:
//
// fc.boolean() - to represent true/false flags
// fc.constantFrom(...) - to represent enumerated values
// fc.record({ ... }) - to build composite objects
// fc.optional(...) - to represent optional fields
// ------------------------------------------------------------------------------


describe('Property-Based Tests for Orders', () => {
  describe('Invariants', () => {
    
    // Here's an example preservation property!
    it('subtotal should always be non-negative integer', () => {
      fc.assert(
        fc.property(orderArb, (order) => {
          const result = subtotal(order);
          return result >= 0 && Number.isInteger(result);
        }),
        { numRuns: 50 }
      );
    });

    // ---------------------------------------------------------------------------
    // Add more invariant properties for discounts, tax, delivery, and total here
    // You can adapt the starter code below.
    // Feel free to copy, paste, and modify as needed multiple times.
    // ---------------------------------------------------------------------------
    //
    // it('subtotal should always be non-negative integer', () => {
    //   fc.assert(
    //     fc.property(, (order) => { // add the appropriate arbitraries here
    //       const result = subtotal(order); // change this to the function you are testing
    //       return result >= 0 && Number.isInteger(result); // add the property you want to verify
    //     }),
    //     { numRuns: 50 } // you can adjust the number of runs as needed
    //   );
    // });

// ------------------------------------------------------------------------------
// Property tests added below:
// 1) Tax should be applied to hot items only (frozen-only orders -> zero tax).
//    This reveals that tax implementation taxed frozen items instead of hot items.
// 2) Delivery fee is per-order, not per-item. Delivery should be independent of
//    how many items are in the order (base fee per order). Implementation added
//    fee per item which is incorrect.
// 3) PIEROGI-BOGO must require same filling for the free/discounted pack. The
//    original coupon ignored filling equality.
// 4) FIRST10 should return a positive discount for eligible subtotals (>= $20)
//    but original implementation returned a negative value and/or applied it
//    incorrectly.
// ------------------------------------------------------------------------------



    // 1) Tax should be zero for frozen-only orders (hot-only items are the ones taxed)
    it('tax should be zero for orders with only frozen items', () => {
      const frozenItemArb = fc.record({
        kind: fc.constant('frozen'),
        sku: skuArb,
        title: fc.string(),
        filling: fillingArb,
        qty: fc.constantFrom(6, 12, 24),
        unitPriceCents: fc.integer({ min: 500, max: 3000 }),
        addOns: fc.array(addOnArb, { maxLength: 3 })
      });
      const frozenOrderArb = fc.record({ items: fc.array(frozenItemArb, { minLength: 1, maxLength: 5 }) });

      fc.assert(
        fc.property(frozenOrderArb, deliveryArb, (order, delivery) => {
          // deliveryFee may be needed for tax if order has hot items, but here there are none
          const result = tax(order, delivery, 0);
          return result === 0;
        }),
        { numRuns: 50 }
      );
    });

    // 2) Delivery fee should be independent of item count (same order duplicated should have same fee)
    it('delivery fee should be per-order (not per-item)', () => {
      fc.assert(
        fc.property(orderItemArb, deliveryArb, profileArb, (item, delivery, profile) => {
          const orderOne = { items: [item] };
          const orderTwo = { items: [item, item] }; // duplicate same item
          const feeOne = deliveryFee(orderOne, delivery, profile);
          const feeTwo = deliveryFee(orderTwo, delivery, profile);
          return feeOne === feeTwo;
        }),
        { numRuns: 50 }
      );
    });

    // 3) PIEROGI-BOGO requires same filling for the two 6-packs, so orders with two
    //    6-packs of different fillings must NOT get a BOGO discount.
    it('PIEROGI-BOGO should not apply when two 6-packs have different fillings', () => {
      const sixPackItem = (filling) =>
        fc.record({
          kind: fc.constant('hot'),
          sku: fc.constant('P6-POTATO'),
          title: fc.string(),
          filling: fc.constant(filling),
          qty: fc.constant(6),
          unitPriceCents: fc.integer({ min: 500, max: 3000 }),
          addOns: fc.array(addOnArb, { maxLength: 3 })
        });

      fc.assert(
        fc.property(
          fillingArb.filter((f) => f !== 'potato').chain((f1) =>
            fillingArb.filter((f) => f !== f1).map((f2) => ({ f1, f2 }))
          ),
          fc.integer({ min: 500, max: 3000 }),
          profileArb,
          (fillPair, price, profile) => {
            const itemA = { kind: 'hot', sku: 'P6-POTATO', title: 'A', filling: fillPair.f1, qty: 6, unitPriceCents: price, addOns: [] };
            const itemB = { kind: 'hot', sku: 'P6-POTATO', title: 'B', filling: fillPair.f2, qty: 6, unitPriceCents: price, addOns: [] };
            const order = { items: [itemA, itemB] };
            const discountTotal = discounts(order, profile, 'PIEROGI-BOGO');
            // When fillings differ, BOGO should not apply -> discount should NOT include BOGO amount
            return discountTotal >= 0 && discountTotal < Math.floor(itemA.unitPriceCents * itemA.qty * 0.5);
          }
        ),
        { numRuns: 50 }
      );
    });

    // 4) FIRST10 should produce a positive discount for eligible subtotals (>= $20)
    it('FIRST10 coupon should apply a positive discount for orders >= $20', () => {
      fc.assert(
        fc.property(
          orderItemArb,
          profileArb,
          (item, profile) => {
            // Build an order with enough subtotal to exceed $20
            const count = Math.ceil(2000 / (item.unitPriceCents * item.qty || 1));
            const items = new Array(Math.max(1, count)).fill(item);
            const order = { items };
            const sub = subtotal(order);
            if (sub < 2000) return true; // skip non-eligible cases
            const disc = discounts(order, profile, 'FIRST10');
            return disc > 0 && disc <= Math.floor(sub * 0.10);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
