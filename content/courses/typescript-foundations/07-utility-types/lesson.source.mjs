// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-tsf-3-2",
    title: "Utility types: Partial, Pick, Omit & Record",
    slug: { _type: "slug", current: "typescript-utility-types-partial-pick-omit-record" },
    description:
        "The new quick-edit panel in the Chợ Sớm admin let the warehouse team update stock in two clicks. After one busy morning, 40 products had no name and no price, the shop showed \"undefined, NaN đ\", and one product had a new sku that no order could find. Learn to derive types from the ones you have instead of copying them: Partial, Required, Readonly, Pick, Omit and Record, what a mapped type is, how keyof typeof and indexed access types turn values into types, and why an optional property still lets undefined overwrite real data unless you check for it or turn on exactOptionalPropertyTypes.",
    estimatedTime: 20,

    scenario: {
        role: "Junior frontend developer at Chợ Sớm, an online grocery in Hà Nội, moving the web shop from JavaScript to TypeScript",
        problem:
            "The admin quick-edit panel sends a patch with every field of the product, and the form library sets the fields nobody touched to undefined. The save function spread the patch over the product. On Tuesday morning the warehouse team updated the stock of 40 products, and all 40 lost their name and price; the shop listed them as \"undefined\" at NaN đ until noon. The same week, a typo in the sku field of the panel renamed a product, and three open orders pointed to a sku that no longer existed.",
    },

    content: [
        h2("1. The incident"),
        p("Every morning at 05:30 the warehouse team in Long Biên counts what arrived from the farms and updates the stock in the admin. The old edit page had 14 fields and took a minute per product, so the team built a \"quick edit\" panel: one row per product, stock and price editable inline, saved on blur. The form library behind it sends the whole product on every save, and the fields the user did not touch arrive as `undefined`."),
        p("On Tuesday Nguyễn Văn Đạt updated the stock of 40 products before 06:00. At 07:00 the first customers saw a fruit section full of `undefined` at `NaN đ`, and the checkout refused every basket containing one of them. The same week, Đạt typed into the sku cell by mistake and renamed `MEA-204`; three open orders pointed to a product that no longer existed."),

        h2("2. Reproduce it"),
        code("javascript", String.raw`
// quick-edit.js: the admin "quick edit" panel
function applyEdit(product, patch) {
  return { ...product, ...patch };
}

const product = { sku: "MEA-204", name: "Thịt ba chỉ", category: "meat", price: 125000, stock: 12 };
// The form library sends every field; the ones the admin did not touch are undefined.
const patch = { name: undefined, price: undefined, stock: 25 };

const saved = applyEdit(product, patch);
console.log(JSON.stringify(saved));
console.log(` + "`shop: ${saved.name}, 2 x ${saved.price} = ${2 * saved.price} đ`" + String.raw`);`, "quick-edit.js"),
        code("text", String.raw`
$ node quick-edit.js
{"sku":"MEA-204","category":"meat","stock":25}
shop: undefined, 2 x undefined = NaN đ`),
        p("Object spread copies **every own property** of `patch`, including the ones whose value is `undefined`. So `name` and `price` are overwritten with `undefined`, and `JSON.stringify` then leaves them out completely: the API received a product without a name or a price, and stored it. Nothing in `applyEdit` says which fields a patch may contain, so a patch with `sku` was spread just as happily."),

        h2("3. Partial: every property optional"),
        p("A patch is \"some of the fields of a product\". You could write a second interface with every property optional, but then you would have two lists to keep in sync. TypeScript can **compute** it instead:"),
        code("typescript", String.raw`
type Category = "vegetables" | "fruit" | "meat" | "dairy" | "dry";

interface Product {
  readonly sku: string;
  name: string;
  category: Category;
  price: number;
  stock: number;
}

type ProductPatch = Partial<Product>;
// { readonly sku?: string; name?: string; category?: Category; price?: number; stock?: number }`),
        p("`Partial<T>` is a **utility type**: a generic type from the standard library that takes a type and returns a new one. It is not magic; it is a **mapped type**, a type that loops over the keys of another:"),
        code("typescript", String.raw`
type Partial<T> = { [K in keyof T]?: T[K] };
//                  ^ for every key K of T   ^ make it optional, with the same type`),
        p("`keyof T` is the union of `T`'s property names (lesson 5), and `T[K]` is the type of property `K`. When someone adds a `unit` property to `Product`, `ProductPatch` gets an optional `unit` automatically."),

        h2("4. Pick and Omit: choosing properties"),
        code("typescript", String.raw`
// only some properties: what a product card needs
type ProductCard = Pick<Product, "name" | "price">;          // { name: string; price: number }

// all properties except some: what the create form sends (the server makes the sku)
type NewProduct = Omit<Product, "sku">;

// combined: a patch that can never contain the sku
type ProductPatch = Partial<Omit<Product, "sku">>;

applyEdit(product, { sku: "MEA-999" });
// error TS2353: Object literal may only specify known properties, and 'sku' does not exist
//   in type 'Partial<Omit<Product, "sku">>'.
applyEdit(product, { prise: 120000 });
// error TS2561: Object literal may only specify known properties, but 'prise' does not exist
//   in type 'Partial<Omit<Product, "sku">>'. Did you mean to write 'price'?`),
        bullets([
            "**`Pick<T, Keys>`** keeps the listed properties, **`Omit<T, Keys>`** drops them. The keys of `Pick` must exist in `T`; `Omit` accepts any string, so a typo in an `Omit` key silently omits nothing - double-check them.",
            "**`Required<T>`** is the opposite of `Partial`: every property required. **`Readonly<T>`** makes every property `readonly` - useful for the copy of a product stored in a placed order, whose price must never change.",
            "**Derived types follow the original.** Rename `price` to `unitPrice` in `Product`, and every `Pick`, `Omit` and `Partial` built from it follows - or fails to compile where the old name is still used.",
        ]),
        image("derived-types", {
            alt: "Diagram titled 'One Product interface, many derived types'. The interface Product has readonly sku: string, name: string, category: Category, price: number and stock: number. Arrows lead to four derived types: Partial<Omit<Product, \"sku\">>, the quick-edit patch, which is { name?: string; category?: Category; price?: number; stock?: number }; Pick<Product, \"name\" | \"price\">, a product card, { name: string; price: number }; Readonly<Product>, a placed order's copy with every property readonly; and Record<Category, number>, stock per category, with one key for every category so that a missing key is TS2741. A box at the bottom, 'The trap: optional also accepts undefined', shows that patch = { name: undefined, price: undefined, stock: 25 } compiles, because Partial allows an explicit undefined without exactOptionalPropertyTypes, and that { ...product, ...patch } gives { sku: \"MEA-204\", name: undefined, category: \"meat\", price: undefined, stock: 25 }: a spread copies undefined over the real value, giving 'undefined, 2 x undefined = NaN đ'. Two fixes: copy only the defined fields, for example if (patch.price !== undefined) next.price = patch.price; or make tsc reject the undefined with \"exactOptionalPropertyTypes\": true (TS2379).",
            caption: "Write the shape once; compute the variations.",
        }),

        h2("5. Record: a value for every key"),
        p("`Record<Keys, Value>` is an object type with the given keys, each holding a `Value`. With a union of literals as the keys, it requires **every** key - the exhaustiveness check from lesson 6, for data:"),
        code("typescript", String.raw`
type StockSummary = Record<Category, number>;

const summary: StockSummary = { vegetables: 40, fruit: 0, meat: 12, dairy: 0 };
// error TS2741: Property 'dry' is missing in type '{ vegetables: number; fruit: number; meat: number;
//   dairy: number; }' but required in type 'Record<Category, number>'.

const empty: StockSummary = {};
// error TS2739: Type '{}' is missing the following properties from type 'Record<Category, number>':
//   vegetables, fruit, meat, dairy, dry`),
        p("With `string` as the key type, `Record<string, number>` is a dictionary with any keys - and, as lesson 3 warned, reading a missing key is typed `number` while the value is `undefined`. Prefer a union of literal keys whenever the keys are known, and a `Map` when they are not."),
        h3("Types from values"),
        p("Sometimes the list of categories already exists as a value - for the menu, say. Instead of writing the union a second time, derive it:"),
        code("typescript", String.raw`
const CATEGORIES = ["vegetables", "fruit", "meat", "dairy", "dry"] as const;
type Category = (typeof CATEGORIES)[number];   // "vegetables" | "fruit" | "meat" | "dairy" | "dry"

type EditResult = ReturnType<typeof applyEdit>;      // Product
type EditArgs = Parameters<typeof applyEdit>;        // [product: Product, patch: ProductPatch]`),
        bullets([
            "**`typeof value`** in a type position gives the type of a value. With `as const`, the array's type keeps every literal.",
            "**`(typeof CATEGORIES)[number]`** is an indexed access type: the type of the elements - the union of the five strings. Add a category to the array and the type follows.",
            "**`ReturnType<F>` and `Parameters<F>`** extract the types of a function, handy when a library exports a function but not its types. `Awaited<T>` unwraps a `Promise<T>`.",
        ]),

        h2("6. The undefined trap"),
        p("With `ProductPatch = Partial<Omit<Product, \"sku\">>`, the sku bug is a compile error. But the original bug still compiles:"),
        code("typescript", String.raw`
function applyEdit(product: Product, patch: ProductPatch): Product {
  return { ...product, ...patch };
}

applyEdit(product, { name: undefined, price: undefined, stock: 25 });   // compiles`),
        p("By default, an optional property `price?: number` accepts **two** things: the property being absent, and the property being present with the value `undefined`. TypeScript treats them alike, but a spread does not: an absent property is skipped, a present `undefined` overwrites. There are two ways out, and you can use both:"),
        bullets([
            "**Copy only the fields that are defined.** It works with every compiler setting, and it is the place to validate values too (a negative price is a typing mistake).",
            "**Turn on `exactOptionalPropertyTypes`** (not part of `strict`). Then `price?: number` means \"absent, or a number\", and an explicit `undefined` is an error:",
        ]),
        code("text", String.raw`
$ npx tsc --exactOptionalPropertyTypes
quick-edit.ts:6:14 - error TS2379: Argument of type '{ price: undefined; stock: number; }' is not assignable to
  parameter of type 'Partial<Omit<Product, "sku">>' with 'exactOptionalPropertyTypes: true'.
  Consider adding 'undefined' to the types of the target's properties.
    Types of property 'price' are incompatible.
      Type 'undefined' is not assignable to type 'number'.`),
        callout("info", "Why exactOptionalPropertyTypes is not in strict",
            "Much existing code, including libraries, writes undefined into optional properties on purpose, so turning the option on in a big project produces many errors. tsc --init in TypeScript 5.9 enables it for new projects. In an existing codebase, the explicit copy is the fix that works today; the option is worth turning on when you can."),

        h2("7. The fix"),
        code("typescript", String.raw`
type ProductPatch = Partial<Omit<Product, "sku">>;

function applyEdit(product: Product, patch: ProductPatch): Product {
  const next = { ...product };   // a new object: the caller's product is never changed
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.category !== undefined) next.category = patch.category;
  if (patch.price !== undefined) next.price = patch.price;
  if (patch.stock !== undefined) next.stock = patch.stock;
  return next;
}`, "quick-edit.ts"),
        code("text", String.raw`
{"sku":"MEA-204","name":"Thịt ba chỉ","category":"meat","price":125000,"stock":25}
shop: Thịt ba chỉ, 2 x 125000 = 250000 đ`),
        numbered([
            "**`ProductPatch` is derived from `Product`**, so it can never drift from it, and the sku cannot be part of a patch.",
            "**Only defined fields are copied**, so an untouched field can never erase data - whatever the form library sends.",
            "**The result is a new object.** The admin table compares old and new products to show what changed; editing in place would make them equal.",
            "**The test that should have existed** saves a patch exactly as the form library builds it - every field present, most of them `undefined`.",
        ]),

        h2("8. Your turn"),
        p("The real panel also refuses negative prices and stock, and the dashboard needs the total stock per category. Write both with the derived types."),
        challenge("chal_coding_tsf_321", "Start from a copy of the product ({ ...product }) and assign each patch field only when it is not undefined; for price and stock also require >= 0 (0 is valid). For the summary, start from an object literal with all five categories set to 0 - that is what makes it a Record<Category, number> - and add each product's stock to summary[p.category]."),

        h2("9. Pitfalls"),
        bullets([
            "**Spreading a patch**: `{ ...product, ...patch }` copies `undefined` values over real ones. Copy defined fields only.",
            "**Copying a type by hand** instead of deriving it: the copy drifts the first time the original changes.",
            "**Typos in `Omit` keys**: `Omit<Product, \"skuu\">` compiles and omits nothing. `Pick` checks its keys; `Omit` does not.",
            "**`Record<string, T>` when the keys are known**: you lose the check that every key is present, and every read is unchecked.",
            "**`Partial` everywhere**: a function that needs a whole product should take `Product`. Make things optional only where data really is partial.",
            "**Utility types do not validate at runtime**: `Partial<Product>` describes a patch, it does not check one that arrives as JSON (next lesson).",
        ]),

        h2("10. Checklist"),
        bullets([
            "Each entity has one interface; forms, patches, cards and API payloads derive from it with `Partial`, `Pick`, `Omit` and `Readonly`.",
            "Fields that must never change (ids, skus) are excluded from patch types.",
            "Patches are applied by copying defined fields into a new object.",
            "Per-category or per-status data uses `Record<Union, T>`, so every key is present.",
            "Unions that also exist as values are derived with `as const` and `(typeof X)[number]`.",
        ]),
        p("Next lesson: unknown versus any. A supplier changed its webhook to send quantities as strings, a cast said the data was fine, and the stock of eggs became 4812."),
    ],
});
