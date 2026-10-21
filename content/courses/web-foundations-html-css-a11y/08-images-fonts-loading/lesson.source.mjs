// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-webf-3-3",
    title: "Images & fonts: loading what the page needs",
    slug: { _type: "slug", current: "images-fonts-loading" },
    description:
        "A landing page redesign takes mobile LCP from 2.1 s to 4.8 s and CLS to 0.31, and screen readers announce the products as \"image\". Learn the Core Web Vitals, alt text that says what an image is for, width/height to stop layout shifts, srcset/sizes and <picture>, lazy loading and fetchpriority in the right places, and web fonts that never hide text - then write an audit that catches these mistakes.",
    estimatedTime: 25,

    scenario: {
        role: "Front-end developer, marketing site team at an outdoor-gear shop",
        problem:
            "The spring campaign page was redesigned with a full-width photo hero, a new headline font and a product grid. Four weeks later the field data for mobile visitors shows LCP at the 75th percentile up from 2.1 s to 4.8 s and CLS up from 0.04 to 0.31, and mobile sign-ups from the page are down 12%. Customers on slow connections report a blank space where the headline should be, then a page that jumps just as they try to tap \"Shop packs\". A screen-reader user writes in: every product in the grid is announced as \"image\", and one of them as \"summit-jacket dot jpg\".",
    },

    content: [
        h2("1. The incident: a redesign that looks fast and loads slowly"),
        p("On a fast laptop the new page looked great, so it shipped. This is the part of the markup and CSS that matters:"),
        code("html", `
<!-- spring.html (excerpt) -->
<head>
  <link rel="stylesheet" href="/css/spring.css">
</head>
<body>
  <header>
    <a href="/"><img src="/img/logo.svg" alt="Northwind Outdoor" width="120" height="32"></a>
  </header>
  <main>
    <section class="hero">
      <img src="/img/hero-spring.jpg" loading="lazy"
           alt="Hiker on a ridge at sunrise wearing the Ridgeline 40 pack">
      <h1>Go further this spring</h1>
      <a class="button" href="/packs">Shop packs</a>
    </section>
    <ul class="products">
      <li><img src="/img/ridgeline-40.jpg" alt="image"> <h2>Ridgeline 40</h2></li>
      <li><img src="/img/summit-jacket.jpg"> <h2>Summit Jacket</h2></li>
    </ul>
  </main>
</body>`, "spring.html"),
        code("css", `
/* spring.css (excerpt) */
@font-face {
  font-family: "Trail Sans";
  src: url("/fonts/TrailSans-Bold.ttf") format("truetype");   /* 412 KB, every glyph */
  font-weight: 700;
}
h1 { font-family: "Trail Sans", sans-serif; }
.hero img { width: 100%; }`, "spring.css"),
        p("Every line is valid HTML and CSS. The problems are about **what the browser knows, and when**: the hero file is 2400 pixels wide but shown 390 CSS px wide on a phone; `loading=\"lazy\"` tells the browser to wait before it even requests the most important image on the page; with no `width` and `height` the browser cannot reserve space for it; the headline font is a large TTF file and the text stays invisible while it downloads; and two product photos have no useful text alternative."),

        h2("2. Reproduce it"),
        p("You can see every symptom with Chrome DevTools on your own machine. Open the page in a new incognito window so extensions and the cache do not interfere."),
        numbered([
            "**Lighthouse.** Open DevTools, then the Lighthouse panel. Choose Navigation mode, Mobile and the Performance category, and run it. The report shows LCP and CLS, and its diagnostics name the LCP element (the hero `<img>`) and the elements that moved. Lab numbers differ from field data, but the elements it names are the ones to fix.",
            "**Network panel.** Tick Disable cache, pick a slow throttling profile and reload. Filter by Img: the hero request starts only after the CSS has arrived and layout has run - long after the HTML parser saw the `<img>`. Its size column shows the full 2400 px JPEG. Filter by Font: the TTF file takes seconds, and the headline is blank until it lands.",
            "**Performance panel.** Record a reload. The timings track marks LCP; the layout-shift entries show when the content jumped, and selecting one highlights the element that moved.",
            "**Rendering tab.** Open the command menu (Ctrl+Shift+P or Cmd+Shift+P), run Show Rendering and turn on Layout Shift Regions. Reload: the area below the hero flashes when the image arrives and pushes it down.",
            "**Accessibility tree.** In the Elements panel select each product `<img>` and open the Accessibility pane. One has the computed name \"image\". The other has no `alt` at all, so there is no text alternative; some screen readers then read the file name instead.",
        ]),

        h2("3. Core Web Vitals in one paragraph"),
        p("Core Web Vitals are three user-centred metrics Google defines for page experience. **Largest Contentful Paint (LCP)** is the time until the largest image or text block in the viewport is rendered: it measures loading. **Cumulative Layout Shift (CLS)** adds up the unexpected movement of visible content (the largest burst of shifts during the visit) as a unitless score: it measures visual stability. **Interaction to Next Paint (INP)** is the delay between a click, tap or key press and the next frame the page paints, taken over the whole visit: it measures responsiveness. Each is judged at the **75th percentile** of real page visits, separately for mobile and desktop, so a page passes only if at least three out of four visits are good."),
        bullets([
            "**LCP:** good at 2.5 s or less, poor above 4 s.",
            "**CLS:** good at 0.1 or less, poor above 0.25. Shifts that happen right after a user input (within 500 ms) do not count.",
            "**INP:** good at 200 ms or less, poor above 500 ms. INP replaced First Input Delay as a Core Web Vital in March 2024.",
        ]),
        p("The campaign page went from a good LCP (2.1 s) to a poor one (4.8 s), and from a good CLS (0.04) to a poor one (0.31). Images and fonts caused both."),
        callout("info", "Lab data and field data",
            "Lighthouse and the Performance panel are lab tests: one simulated device, one network profile, no real user. Field data comes from real visits (the Chrome UX Report, or your own monitoring with a library such as web-vitals). Use field data to decide whether there is a problem and lab tools to find and fix it. Lighthouse cannot measure INP in navigation mode, because nobody interacts with the page."),

        h2("4. Alt text: say what the image is for"),
        p("WCAG 2.2 success criterion **1.1.1 Non-text Content** (level A) asks for a text alternative that serves the same purpose as the image. The `alt` attribute is that alternative for `<img>`. What to write depends on the image's job, not on what it looks like:"),
        bullets([
            "**Informative image:** it adds information the text does not. Describe that information briefly: `alt=\"Ridgeline 40 backpack in moss green, side view\"`. Do not start with \"image of\" - screen readers already announce it as an image.",
            "**Decorative image:** it adds nothing (a divider, a background texture, a photo that repeats the caption next to it). Use an empty `alt=\"\"`. Assistive technology then skips the image entirely.",
            "**Functional image:** it is the only content of a link or a button. The alt text becomes the name of that control, so it says what the control does or where it goes: the logo link gets `alt=\"Northwind Outdoor\"` (or \"Northwind Outdoor home\"), an icon-only cart link gets `alt=\"Cart\"`.",
        ]),
        code("html", `
<!-- informative -->
<img src="/img/ridgeline-40.jpg" alt="Ridgeline 40 backpack in moss green, side view" width="600" height="600">

<!-- decorative: present but empty -->
<img src="/img/wave-divider.svg" alt="" width="390" height="24">

<!-- functional: the image is the link's only content -->
<a href="/cart"><img src="/img/icons/cart.svg" alt="Cart" width="24" height="24"></a>`, "alt-text.html"),
        callout("warning", "alt=\"\" and no alt are not the same",
            "alt=\"\" is a deliberate statement: this image is decorative, skip it. A missing alt attribute says nothing, so assistive technology has to guess, and some screen readers fall back to the file name (\"summit-jacket dot jpg\"). Generic text such as alt=\"image\" or alt=\"photo\" is as unhelpful as no alt at all."),

        h2("5. Reserve the space: width, height and height: auto"),
        p("Without `width` and `height`, the browser does not know how tall an image will be until enough of the file has arrived to read its dimensions. Until then the box is 0 px tall; when the image appears, everything below it moves down. That movement is a layout shift, and the hero shift alone gave the page most of its 0.31 CLS."),
        p("With the attributes, browsers compute the aspect ratio from them before the download starts (the HTML standard maps them to the CSS `aspect-ratio` property). The attribute values only need the right **ratio**: CSS decides the rendered size, and `height: auto` keeps the ratio when the width changes."),
        code("css", `
/* base.css - responsive images that keep the ratio from their width/height attributes */
img {
  max-width: 100%;
  height: auto;
}`, "base.css"),
        code("html", `
<!-- the file is 2400 x 1800 (4:3); any 4:3 pair works -->
<img src="/img/hero-1200.jpg" width="1600" height="1200" alt="...">`, "hero.html"),
        callout("tip", "Containers can reserve space too",
            "For an embed, an ad slot or an image whose ratio you do not know until runtime, give the container the space in CSS: aspect-ratio: 16 / 9 or a min-height. The rule is the same - the box must have its final size before the content arrives."),

        h2("6. Responsive images: srcset, sizes and <picture>"),
        p("A phone with a 390 CSS px wide screen and a device pixel ratio (DPR) of 3 has 1170 device pixels across. A 2400 px wide JPEG is about twice that, and on a phone with DPR 2 it is about three times what the screen can show - most of those bytes are wasted on the slowest connections. `srcset` with **w descriptors** lists the same image in several widths, and `sizes` tells the browser how wide the image slot will be:"),
        code("html", `
<img src="/img/hero-1200.jpg"
     srcset="/img/hero-480.jpg 480w, /img/hero-800.jpg 800w,
             /img/hero-1200.jpg 1200w, /img/hero-1600.jpg 1600w"
     sizes="(min-width: 1280px) 1280px, 100vw"
     width="1600" height="1200" alt="...">`, "hero.html"),
        bullets([
            "`480w` means \"this file is 480 pixels wide\". The browser needs it to know what each candidate offers.",
            "`sizes` is read before layout: the first media condition that matches gives the slot width (here 1280px on wide screens, otherwise the full viewport width). Without `sizes`, the browser assumes `100vw`, which over-downloads for any image that is not full width - such as a product card in a grid.",
            "The browser picks a candidate based on the slot width from `sizes` and the device pixel ratio. The exact choice is up to the browser (it may also consider the network or what is already cached), so do not write code that depends on a specific file being chosen.",
        ]),
        p("`<picture>` is for two other jobs. With `type`, it offers modern formats such as AVIF and WebP, which are usually much smaller than JPEG at similar quality, and falls back to the `<img>`. With `media`, it does **art direction**: a different crop for small screens, not just a smaller file. The browser uses the first `<source>` whose `type` it supports and whose `media` matches; the `<img>` inside is required and still carries `alt`, `width`, `height` and the loading attributes."),
        code("html", `
<picture>
  <!-- art direction: a portrait crop on narrow screens -->
  <source media="(max-width: 600px)" type="image/avif"
          srcset="/img/hero-portrait-480.avif 480w, /img/hero-portrait-960.avif 960w" sizes="100vw">
  <!-- format: AVIF where supported, otherwise the <img> below -->
  <source type="image/avif" srcset="/img/hero-800.avif 800w, /img/hero-1600.avif 1600w" sizes="100vw">
  <img src="/img/hero-1200.jpg" width="1600" height="1200" alt="...">
</picture>`, "hero-picture.html"),

        h2("7. Load order: lazy below the fold, high priority for the hero"),
        p("Browsers start downloading images early: a preload scanner reads ahead in the HTML and requests the `<img>` sources it finds, even before the CSS has arrived. Three attributes change that behaviour:"),
        bullets([
            "`loading=\"lazy\"` defers the request until the image is close to the viewport. The browser can only know that after layout, so a lazy image above the fold starts late by design. Use it for images **below the fold** (product grids further down, footers, long articles) and **never on the LCP image**.",
            "`fetchpriority=\"high\"` is a hint that this image matters more than other images, so it is fetched earlier and with more bandwidth. Put it on the hero, usually on one image per page; if every image is high priority, none is.",
            "`decoding=\"async\"` is a hint about decoding the downloaded image without holding up other content. It does not start the download sooner or make the file smaller, so it fixes neither LCP problem here.",
        ]),
        image("hero-waterfall-before-after", {
            alt: "Two simplified network waterfalls for the same mobile page, 0 to 5 seconds. Before: the 412 KB TTF font hides the headline from about 1.1 to 3.3 s, and the lazy 2400 px hero JPEG is requested only after layout and finishes at 4.8 s, the LCP; the unsized hero makes the content below drop about 290 px (CLS 0.31). After: hero-800.avif with fetchpriority high and the preloaded WOFF2 font both start right after the HTML, LCP is at 1.9 s, fallback text shows from the first paint, and nothing jumps.",
            caption: "The fix does not make the network faster. It lets the browser request the right file earlier, and reserves space so nothing moves when files arrive.",
        }),
        p("Now apply sections 4 to 7 to the incident before reading on:"),
        challenge("chal_quiz_webf_331"),

        h2("8. Fonts: show text now, swap without a jump"),
        p("A web font is a resource like an image, and the headline font caused two of the incident's symptoms: invisible text for up to 3 seconds, then a jump when it arrived."),
        h3("Smaller files: WOFF2 and subsetting"),
        p("Serve fonts as **WOFF2**, a compressed format every current browser supports; it is usually much smaller than the same font as TTF. Then **subset**: a full font contains glyphs for many languages, and a campaign headline needs a few hundred. Split the font into files per script and describe each with `unicode-range`; the browser downloads a file only if the page uses a character in its range."),
        h3("font-display: swap"),
        p("With the default `font-display: auto`, most browsers hide text that uses a font that is still downloading for up to about 3 seconds - the blank headline users saw. `font-display: swap` shows the text immediately in the fallback font and swaps in the web font when it arrives. Readers get the content at once; the cost is a visible swap, which the last step below makes much smaller."),
        h3("Preload only the critical fonts"),
        p("A font is discovered late: the browser must download the CSS and find text that uses it before it requests the file. `<link rel=\"preload\">` starts the download with the HTML. Preload only the one or two font files used above the fold - every preload competes for bandwidth with the hero image. Fonts are always fetched in CORS mode, so the preload needs `crossorigin` even for a font on your own origin; without it the preloaded file is not reused and the font downloads twice."),
        code("html", `
<link rel="preload" href="/fonts/trail-sans-700-latin.woff2" as="font" type="font/woff2" crossorigin>`, "spring.html"),
        h3("A size-adjusted fallback"),
        p("When the web font replaces the fallback, lines can get wider or taller and push content down. You can make the fallback take up nearly the same space: declare a second `@font-face` that points at a local system font and adjusts it with `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override`. The right percentages depend on both fonts; tools such as Next.js `next/font`, Fontaine or Capsize compute them from the font files."),
        code("css", `
@font-face {
  font-family: "Trail Sans";
  src: url("/fonts/trail-sans-700-latin.woff2") format("woff2");
  font-weight: 700;
  font-display: swap;
  unicode-range: U+0000-00FF, U+2013-2014, U+2018-201D;   /* Latin, dashes, curly quotes */
}

/* Arial, resized to match Trail Sans (example values - compute them for your fonts) */
@font-face {
  font-family: "Trail Sans Fallback";
  src: local("Arial");
  size-adjust: 104%;
  ascent-override: 92%;
  descent-override: 24%;
  line-gap-override: 0%;
}

h1 { font-family: "Trail Sans", "Trail Sans Fallback", sans-serif; }`, "fonts.css"),

        h2("9. The fix"),
        p("The corrected page keeps the same design. It changes only what the browser is told:"),
        code("html", `
<head>
  <link rel="preload" href="/fonts/trail-sans-700-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/spring.css">
</head>
<body>
  <!-- header unchanged: the logo link already had a good alt, width and height -->
  <main>
    <section class="hero">
      <picture>
        <source type="image/avif"
                srcset="/img/hero-480.avif 480w, /img/hero-800.avif 800w,
                        /img/hero-1200.avif 1200w, /img/hero-1600.avif 1600w"
                sizes="(min-width: 1280px) 1280px, 100vw">
        <img src="/img/hero-1200.jpg"
             srcset="/img/hero-480.jpg 480w, /img/hero-800.jpg 800w,
                     /img/hero-1200.jpg 1200w, /img/hero-1600.jpg 1600w"
             sizes="(min-width: 1280px) 1280px, 100vw"
             width="1600" height="1200" fetchpriority="high"
             alt="Hiker on a ridge at sunrise wearing the Ridgeline 40 pack">
      </picture>
      <h1>Go further this spring</h1>
      <a class="button" href="/packs">Shop packs</a>
    </section>
    <ul class="products">
      <li>
        <img src="/img/ridgeline-40-400.jpg"
             srcset="/img/ridgeline-40-400.jpg 400w, /img/ridgeline-40-800.jpg 800w"
             sizes="(min-width: 768px) 25vw, 45vw" width="600" height="600" loading="lazy"
             alt="Ridgeline 40 backpack in moss green, side view">
        <h2>Ridgeline 40</h2>
      </li>
      <!-- ... the Summit Jacket card gets the same treatment and alt="Summit Jacket in red with the hood up" -->
    </ul>
  </main>
</body>`, "spring.html"),
        bullets([
            "**LCP:** the hero is in the HTML without `loading=\"lazy\"`, so the preload scanner requests it with the first resources; `fetchpriority=\"high\"` moves it ahead of other images; AVIF from `srcset` and `sizes` sends a file sized for the slot instead of 2400 px of JPEG.",
            "**CLS:** `width`/`height` plus `height: auto` reserve the 4:3 box before the image arrives; the size-adjusted fallback font keeps the headline the same size when the web font swaps in.",
            "**Fonts:** a subsetted WOFF2 file, preloaded with `crossorigin`, displayed with `swap` - the headline is readable at the first paint.",
            "**Alt text:** product photos describe what the picture adds, and decorative images keep `alt=\"\"`. The product images further down stay lazy, where lazy loading belongs.",
        ]),

        h2("10. Catch it before it ships: an image audit"),
        p("Each of these mistakes is easy to make again in the next campaign. An audit in a test can catch them from data the browser already has: each image's attributes, its rendered box after layout (`getBoundingClientRect()`) and the width of the downloaded file. In the exercise that data is given to you as plain objects, with the viewport size and device pixel ratio. Your `auditImages(images, viewport)` reports per image, in a fixed order, a missing or generic `alt`, missing `width`/`height`, lazy loading above the fold, an LCP candidate without `fetchpriority=\"high\"`, `srcset` without `sizes`, and a file far wider than its slot. The starter's comment defines every rule, including the LCP candidate and its tie-break."),
        challenge("chal_coding_webf_332", "Find the LCP candidate in a first pass over the images: skip images whose top is not above the fold, compute the visible area by clipping the box to the first viewport (both width and height), and only replace the current best when the new area is strictly larger - that keeps the earlier image on a tie. Then build each image's issues in a second pass, pushing the codes in the order the starter lists them. Check alt with === null, not with a falsy test: \"\" is a valid value."),

        h2("11. Pitfalls to recognise in code review"),
        bullets([
            "**`loading=\"lazy\"` added to every image** by a component default or a lint rule. The hero and anything else visible on the first screen must opt out.",
            "**`fetchpriority=\"high\"` on a lazy image.** Priority does not cancel the lazy delay; the request still waits for layout.",
            "**`width`/`height` set in CSS only.** `.hero img { width: 100%; }` with no attributes still leaves the height unknown until the file arrives. Keep the attributes, and let CSS set `height: auto`.",
            "**`srcset` with w descriptors but no `sizes`.** The browser assumes `100vw` and downloads hero-sized files for small grid cards.",
            "**A CSS background image as the hero.** The preload scanner cannot see images referenced only from CSS, and they cannot have alt text. Use an `<img>` for content images.",
            "**A font preload without `crossorigin`.** The browser cannot reuse it for the `@font-face` request and downloads the font twice.",
            "**`alt` text that repeats the file name or says \"image\"**, and **meaningful images with `alt=\"\"`**. Ask what the image is for: inform, decorate, or act.",
        ]),

        h2("12. Checklist"),
        bullets([
            "You know the page's LCP element on mobile (Lighthouse or the Performance panel), and it is not lazy-loaded and has `fetchpriority=\"high\"`.",
            "Every `<img>` has `width` and `height` attributes with its real aspect ratio, and the CSS uses `height: auto`.",
            "Large images use `srcset` with w descriptors and an honest `sizes`; `<picture>` offers AVIF or WebP with a JPEG or PNG fallback, and a different crop where the design needs one.",
            "`loading=\"lazy\"` is used only below the fold.",
            "Every `<img>` has an `alt` attribute: a short description for informative images, `alt=\"\"` for decorative ones, and the action or destination for images inside links and buttons (WCAG 1.1.1).",
            "Fonts are subsetted WOFF2 with `font-display: swap`; at most the one or two critical files are preloaded, with `as=\"font\"`, `type` and `crossorigin`.",
            "The fallback font is size-adjusted so the swap does not move the layout.",
            "Field data for mobile meets the targets at the 75th percentile: LCP of 2.5 s or less, CLS of 0.1 or less, INP of 200 ms or less.",
        ]),
    ],
});
