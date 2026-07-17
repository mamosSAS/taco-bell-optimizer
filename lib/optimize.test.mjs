import assert from "node:assert";
import { optimize } from "./optimize.js";

const singles = [
  { code: "TACO", name: "Crunchy Taco", price: 2.19 },
  { code: "DLT", name: "Doritos Locos Taco", price: 3.09 },
  { code: "B5L", name: "Beefy 5-Layer", price: 4.19 },
  { code: "TWISTS", name: "Cinnamon Twists", price: 1.19 },
];
// $5 box: fixed B5L + taco slot (TACO $0 / DLT +$0.90) + twists slot
const box = {
  name: "Classic Luxe Box",
  price: 5,
  slots: [
    { defaultCode: "B5L", defaultName: "Beefy 5-Layer", qty: 1, options: [{ code: "B5L", name: "Beefy 5-Layer", upcharge: 0 }] },
    { defaultCode: "TACO", defaultName: "Crunchy Taco", qty: 1, options: [
      { code: "TACO", name: "Crunchy Taco", upcharge: 0 },
      { code: "DLT", name: "Doritos Locos Taco", upcharge: 0.9 },
    ] },
    { defaultCode: "TWISTS", defaultName: "Cinnamon Twists", qty: 1, options: [{ code: "TWISTS", name: "Cinnamon Twists", upcharge: 0 }] },
  ],
};

// single cheap item: don't buy a box for it
let r = optimize({ TWISTS: 1 }, singles, [box]);
assert.equal(r.total, 1.19);

// B5L + DLT: box ($5) + DLT swap (+$0.90) = $5.90 beats à la carte $7.28
r = optimize({ B5L: 1, DLT: 1 }, singles, [box]);
assert.equal(r.total, 5.9);
assert.equal(r.picks.length, 1);
assert.equal(r.naive, 7.28);
assert.equal(r.picks[0].swaps.length, 1);

// the motivating case: box to get ONE item via swap still wins.
// DLT alone: à la carte $3.09 < box $5.90, so à la carte...
r = optimize({ DLT: 1 }, singles, [box]);
assert.equal(r.total, 3.09);
// ...but B5L+TACO+DLT+TWISTS: box($5.90 w/ DLT swap) + taco $2.19... vs box+box?
r = optimize({ B5L: 1, TACO: 1, DLT: 1, TWISTS: 1 }, singles, [box]);
assert.equal(r.total, 5.9 + 2.19); // box covers B5L,DLT,TWISTS; TACO à la carte

// quantities: 2 boxes beat anything for 2×(B5L+TACO)
r = optimize({ B5L: 2, TACO: 2 }, singles, [box]);
assert.equal(r.total, 10);
assert.equal(r.picks[0].count, 2);

// unavailable item is reported, rest still optimized
r = optimize({ GHOST: 1, TACO: 1 }, singles, [box]);
assert.deepEqual(r.unavailable, ["GHOST"]);
assert.equal(r.total, 2.19);

// multi-qty slot: party pack of 4 tacos, swap block to DLT
const pack = {
  name: "Taco Party Pack",
  price: 7.5,
  slots: [{ defaultCode: "TACO", defaultName: "Crunchy Taco", qty: 4, options: [
    { code: "TACO", name: "Crunchy Taco", upcharge: 0 },
    { code: "DLT", name: "Doritos Locos Taco", upcharge: 0.7 },
  ] }],
};
r = optimize({ DLT: 4 }, singles, [pack]);
assert.equal(r.total, 7.5 + 4 * 0.7); // $10.30 beats 4×$3.09=$12.36

console.log("optimize.test: all assertions passed");
