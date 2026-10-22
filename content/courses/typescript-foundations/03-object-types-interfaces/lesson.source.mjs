// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-tsf-1-3",
    title: "Object types, interfaces & optional properties",
    slug: { _type: "slug", current: "typescript-object-types-interfaces-optional-properties" },
    description:
        "Two hundred bags left the Chợ Sớm packing hub with labels that said \"Apt undefined\" and \"Note: undefined\", and couriers rang the wrong doors in three apartment towers. One misspelled property name and one missing check were enough. Learn to describe objects with type aliases and interfaces, what tsc checks on every property read and object literal (typos, excess properties, readonly), how optional properties differ from required ones and why a template string happily prints undefined, how structural typing works, and how to extend and combine object types.",
    estimatedTime: 20,

    scenario: {
        role: "Junior frontend developer at Chợ Sớm, an online grocery in Hà Nội, moving the web shop from JavaScript to TypeScript",
        problem:
            "The backend added apartment numbers to delivery addresses, and the label printer at the Long Biên packing hub was updated to show them. The next morning 214 labels said \"Apt undefined\", every label without a customer note said \"Note: undefined\", and couriers spent the first hour calling customers to ask which flat they lived in.",
    },

    content: [
        h2("1. The incident"),
        p("Every bag that leaves the Chợ Sớm packing hub in Long Biên carries a printed label: order number, delivery slot, recipient, address, cash to collect and the customer's note. Apartment towers - Sky Tower on Lê Văn Lương, the Times City blocks - were the couriers' biggest headache: the address said only the building, and the courier had to call the customer from the lobby."),
        p("So the backend team added an optional `apartment` field to the address, and a developer updated the label script on Thursday afternoon. On Friday at 05:40, Hoàng Thị Nga, who runs the morning shift at the hub, sent a photo to the team chat: `Apt undefined, Sky Tower, 21 Lê Văn Lương`. Every label of the morning - 214 of them - had the same `Apt undefined`, including the labels for houses, and every label without a note ended with `Note: undefined`. The couriers called customers from the lobbies, as before, and the first deliveries were 40 minutes late."),

        h2("2. Reproduce it"),
        code("javascript", String.raw`
// labels.js: delivery labels for the Long Biên packing hub
function addressLine(order) {
  const a = order.address;
  return ` + "`Apt ${a.apartmnet}, ${a.building}, ${a.street}`" + String.raw`;
}

function noteLine(order) {
  return ` + "`Note: ${order.note}`" + String.raw`;
}

const order = {
  id: "CS-24051",
  address: { apartment: "1203", building: "Sky Tower", street: "21 Lê Văn Lương",
             ward: "Nhân Chính", district: "Thanh Xuân", city: "Hà Nội" },
};
console.log(addressLine(order));
console.log(noteLine(order));`, "labels.js"),
        code("text", String.raw`
$ node labels.js
Apt undefined, Sky Tower, 21 Lê Văn Lương
Note: undefined`),
        p("Two bugs, one symptom. `a.apartmnet` is a typo: reading a property that does not exist is not an error in JavaScript, it is `undefined`. And `order.note` really is missing - most customers leave no note - so it is `undefined` too. A template string turns `undefined` into the text `\"undefined\"` without complaint, so the label printed it. Neither bug throws, so no log, no alert: just 214 wrong labels."),

        h2("3. Describing an object"),
        p("TypeScript describes an object by listing its properties and their types. You can write the description inline, give it a name with `type`, or declare an `interface`:"),
        code("typescript", String.raw`
// a type alias
type Recipient = { name: string; phone: string };

// an interface: the same idea, written as a declaration
interface Address {
  street: string;
  ward: string;
  district: string;
  city: string;
  building?: string;     // optional: may be missing
  apartment?: string;
}

interface DeliveryOrder {
  readonly id: string;   // set once, never reassigned
  recipient: Recipient;  // object types nest
  address: Address;
  note?: string;
}`),
        p("For object shapes, `type` and `interface` are interchangeable; the differences are small and listed in section 7. Pick one style per codebase - many teams use `interface` for object shapes and `type` for everything else (unions, functions, aliases)."),
        p("With the shape written down, the label script from Thursday does not compile:"),
        code("text", String.raw`
$ npx tsc
labels.ts:18:19 - error TS2551: Property 'apartmnet' does not exist on type 'Address'. Did you mean 'apartment'?

18   return ` + "`Apt ${a.apartmnet}, ${a.building}, ${a.street}`" + String.raw`;
                     ~~~~~~~~~

labels.ts:22:19 - error TS18048: 'order.note' is possibly 'undefined'.

22   return ` + "`Note: ${order.note.trim()}`" + String.raw`;
                     ~~~~~~~~~~`),
        bullets([
            "**Every property read is checked against the type.** A name that is not in the interface is an error, with a suggestion when a known name is close - the typo is a red squiggle while you type it.",
            "**Optional properties are `T | undefined` when you read them.** Calling a method on one, like `.trim()`, is the same TS18048 you met in the last lesson.",
        ]),

        h2("4. Optional properties and the template string trap"),
        p("A `?` after the property name means the property may be **missing** from the object. Reading it gives `string | undefined`, and all the narrowing from the last lesson applies. But look at what the checker does **not** report after you fix the typo:"),
        code("typescript", String.raw`
function addressLine(order: DeliveryOrder): string {
  const a = order.address;
  return ` + "`Apt ${a.apartment}, ${a.building}, ${a.street}`" + String.raw`;   // no error
}`),
        p("A template string accepts any value, `undefined` included, and turns it into text. So this compiles and still prints `Apt undefined` for every house. The type has told you the truth - `apartment` may be missing - but deciding what the label shows in that case is your job. That is the pattern for every optional property: **check it, then build the output from the parts that exist**:"),
        code("typescript", String.raw`
function addressLine(a: Address): string {
  const parts: string[] = [];
  if (a.apartment !== undefined) parts.push(` + "`Apt ${a.apartment}`" + String.raw`);
  if (a.building !== undefined) parts.push(a.building);
  parts.push(a.street);
  return parts.join(", ");
}

function noteLine(order: DeliveryOrder): string | null {
  const note = order.note?.trim();
  return note ? ` + "`Note: ${note}`" + String.raw` : null;   // no line at all for a missing or blank note
}`),
        code("text", String.raw`
Apt 1203, Sky Tower, 21 Lê Văn Lương
Note: Gọi trước khi lên
14 ngõ 75 Hồ Tùng Mậu
(no note)`),
        callout("info", "Optional is not the same as \"may be undefined\"",
            "note?: string means the property may be absent. note: string | undefined means the property must be written, but its value may be undefined. Without the exactOptionalPropertyTypes option (not part of strict), TypeScript also lets you write note: undefined into an optional property, so in practice both read as string | undefined. Use ? for data that is genuinely often missing, like a customer note."),

        h2("5. What tsc checks on objects"),
        image("object-shape-checks", {
            alt: "Diagram titled 'One interface, five checks on every use of the object'. On the left, interface DeliveryOrder has readonly id: string (never reassigned), address: Address (always there) and note?: string (may be missing, drawn with a dashed border); interface Address has street: string and the optional building and apartment, plus ward, district and city. A legend says solid borders are required and dashed borders are optional, and that reading an optional property gives T | undefined. On the right, five checks: a.apartmnet gives TS2551, Property 'apartmnet' does not exist on type 'Address', did you mean 'apartment'; an object literal with nte gives TS2561, excess property, did you mean to write 'note'; order.id = 'CS-24052' gives TS2540, cannot assign to 'id' because it is a read-only property; order.note.trim() gives TS18048, 'order.note' is possibly 'undefined'. The last box, in orange, shows that the template string with a.apartment compiles with no error and prints 'Apt undefined': the type says the value may be missing, only your check decides what the label shows, for example if (a.apartment !== undefined) parts.push(...).",
            caption: "Four of these are compile errors. The fifth is why you still have to read the types.",
        }),
        h3("Excess property checks"),
        p("When you write an **object literal** where a type is expected, TypeScript also checks for properties the type does not have - almost always typos:"),
        code("typescript", String.raw`
const order: DeliveryOrder = {
  id: "CS-24051",
  recipient: { name: "Bùi Lan Anh", phone: "0912 345 678" },
  address: { street: "21 Lê Văn Lương", ward: "Nhân Chính", district: "Thanh Xuân", city: "Hà Nội" },
  nte: "call first",
};
// error TS2561: Object literal may only specify known properties, but 'nte' does not exist
// in type 'DeliveryOrder'. Did you mean to write 'note'?`),
        p("Without this check, `nte` would be silently ignored and the note would be lost - the same kind of bug as `apartmnet`, on the writing side."),
        h3("readonly"),
        code("typescript", String.raw`
order.id = "CS-24052";
// error TS2540: Cannot assign to 'id' because it is a read-only property.`),
        p("`readonly` is a compile-time promise only: the emitted JavaScript can still change the property, and `readonly` on `address` would not stop `order.address.street = ...`. Use it to document and enforce \"this never changes after creation\" - ids, creation times, prices on a placed order."),

        h2("6. Structural typing"),
        p("TypeScript compares object types by their **shape**, not by their name. Any object with the right properties fits, even if it was never declared with that type and has extra properties:"),
        code("typescript", String.raw`
type Contact = { name: string; phone: string };
function callLine(c: Contact): string {
  return ` + "`${c.name} ${c.phone}`" + String.raw`;
}

const courier = { id: "C-12", name: "Lê Thị Mai", phone: "0912 445 566" };
callLine(courier);    // fine: courier has name and phone; the extra id does not matter

callLine({ id: "C-12", name: "Lê Thị Mai", phone: "0912 445 566" });
// error TS2353: Object literal may only specify known properties, and 'id' does not exist in type 'Contact'.`),
        p("The two calls look alike but are treated differently on purpose. A variable may carry extra properties for other reasons, so it is accepted. A fresh object literal written right at the call has no other use, so an extra property there is most likely a mistake. This is how TypeScript describes JavaScript: code that worked with \"anything that has a name and a phone\" keeps working."),

        h2("7. Combining object types"),
        code("typescript", String.raw`
// an interface can extend another: all of Address, plus opening hours
interface StoreAddress extends Address {
  openingHours: string;
}

// a type alias can combine types with & (an intersection: all properties of both)
type PrintedLabel = DeliveryOrder & { printedAt: string };

// an object used as a dictionary: any string key, number values
const stockBySku: Record<string, number> = { "VEG-101": 40, "MEA-204": 12 };
const fruit = stockBySku["FRT-999"];   // type number - but the value is undefined!`),
        bullets([
            "**`extends` and `&`** both build a bigger type from smaller ones. `interface ... extends` reports conflicts between the two shapes as an error at the declaration; `&` reports them later, where you use the type.",
            "**Interfaces can be reopened**: declaring `interface Address` twice merges the two declarations. Libraries use this to let you add properties; in application code it is usually a surprise, which is one reason some teams prefer `type`.",
            "**`Record<string, number>`** (more in lesson 7) describes a dictionary. Reading a key gives `number`, not `number | undefined`, even for a key that is not there - TypeScript assumes you know the keys. The `noUncheckedIndexedAccess` option (not part of strict) changes that; until you turn it on, check dictionary reads like a `find` result.",
        ]),

        h2("8. The fix"),
        p("The label printer now takes a `DeliveryOrder`, builds every line from the parts that exist, and never interpolates an optional property without checking it. The script that produced 214 wrong labels would not compile today: the typo is TS2551, and every optional property is either checked or flagged."),
        numbered([
            "**One interface per backend object**, written from the API contract: required properties without `?`, optional ones with it.",
            "**Typos are compile errors** on reads (TS2551) and on object literals (TS2561).",
            "**Optional properties are checked explicitly** before they reach a template string.",
            "**The label tests use a house and a flat**, one order with every optional property and one with none - the two shapes the interface describes.",
        ]),

        h2("9. Your turn"),
        p("The real label has six lines and more optional properties: a floor (where 0 is the ground floor), a second phone number, cash to collect and the note. Write the whole label from the `DeliveryOrder` interface."),
        challenge("chal_coding_tsf_131", "Build each line on its own. For the street line, push the parts that exist into an array and join them; compare with undefined rather than testing truthiness, because floor 0 is a real floor. For the second phone, an empty string counts as missing. formatVnd is easiest from the right: take groups of three digits from the end of String(amount)."),

        h2("10. Pitfalls"),
        bullets([
            "**Interpolating an optional property**: `${a.apartment}` compiles and prints `undefined`. Check it first.",
            "**Truthiness on optional numbers**: `if (a.floor)` drops floor 0. Compare with `undefined`.",
            "**`Record<string, T>` reads are not checked**: a missing key gives `undefined` with the type `T`.",
            "**`readonly` is shallow and compile-time only**: nested objects can still change, and plain JavaScript callers can still write.",
            "**Spreading or casting to silence an excess property error**: the error is usually a typo; fix the name.",
            "**Mixing `type` and `interface` styles at random**: pick one convention for object shapes.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Every object that crosses a boundary (API response, form, label, event) has a named type or interface.",
            "Required and optional properties match the backend contract; ids and creation data are `readonly`.",
            "No optional property is interpolated or called without a check.",
            "Object literals are written against their declared type, so excess property checks catch typos.",
            "Tests include an object with every optional property and one with none.",
        ]),
        p("Next lesson: arrays, tuples and readonly. The \"best sellers\" widget sorted the shared product list in place, and every category page of the shop showed its products in the wrong order for a whole afternoon."),
    ],
});
