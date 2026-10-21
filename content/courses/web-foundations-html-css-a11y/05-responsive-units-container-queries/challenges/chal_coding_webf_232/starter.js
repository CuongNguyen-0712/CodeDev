/**
 * Resolve a CSS length to CSS pixels, the way the browser does when it computes a value.
 *
 * value: a string in this small subset of CSS (leading and trailing spaces are ignored):
 *
 *   LENGTH     a number immediately followed by a unit, with no space in between.
 *              number: an optional minus sign, then digits with an optional fraction ("2", "1.5",
 *              "-0.5") or a fraction with a leading dot (".5"). No "+" sign, no exponent ("1e3").
 *              unit (lowercase): px, rem, em, %, vw, vh, cqi
 *   EXPR       LENGTH, or LENGTH + LENGTH, or LENGTH - LENGTH. The operator is a single token
 *              with whitespace on both sides ("1rem + 2vw"; "1rem+2vw" is invalid, as in CSS).
 *              At most one operator per EXPR.
 *   value      LENGTH, or clamp(EXPR, EXPR, EXPR), or min(EXPR, ...), or max(EXPR, ...)
 *              Arguments are separated by commas (spaces around them are allowed). min() and max()
 *              take one or more arguments, clamp() exactly three. Functions cannot be nested, and
 *              an EXPR with an operator is only allowed inside a function.
 *
 * ctx describes where the value is used (all sizes in CSS px):
 *   ctx.rootFontSize    font size of the html element: 1rem
 *   ctx.fontSize        the font size that 1em refers to here (in a font-size declaration this is
 *                       the parent's font size; in every other property, the element's own)
 *   ctx.percentBasis    what 100% refers to here (for width: the containing block's width)
 *   ctx.viewport        { width, height } of the viewport: 1vw = width / 100, 1vh = height / 100
 *   ctx.container       { inlineSize } of the nearest query container (container-type:
 *                       inline-size): 1cqi = inlineSize / 100. When ctx.container is null there is
 *                       no container, and 1cqi = viewport.width / 100 (the spec falls back to the
 *                       small viewport size; in this exercise that is viewport.width).
 *
 * Functions, exactly as CSS defines them:
 *   min(a, b, ...)        the smallest argument
 *   max(a, b, ...)        the largest argument
 *   clamp(MIN, VAL, MAX)  max(MIN, min(VAL, MAX)): VAL, kept between MIN and MAX.
 *                         If MIN is larger than MAX, MIN wins.
 *
 * Returns a number: the length in px, rounded to 2 decimals with Math.round(px * 100) / 100.
 * Round only the final result, never the intermediate values.
 *
 * Throws an Error (any Error type) for anything outside this grammar: a number without a unit
 * ("16"), an unsupported unit ("12pt", "1.5dvh"), a space before the unit ("12 px"), an operator
 * outside a function ("1rem + 2vw"), an operator without spaces, two operators in one argument,
 * a wrong number of clamp() arguments, a nested function, any other function (calc, var ...),
 * or an empty string.
 *
 * Examples (rootFontSize 16, fontSize 24, viewport 1000 x 700, container { inlineSize: 300 }):
 *   resolveLength("1.5rem", ctx)                     -> 24
 *   resolveLength("1em", ctx)                        -> 24
 *   resolveLength("50cqi", ctx)                      -> 150
 *   resolveLength("clamp(1rem, 0.5rem + 2vw, 2rem)", ctx)  -> 28   (8 + 20, between 16 and 32)
 *   resolveLength("12pt", ctx)                       -> throws
 *
 * @param {string} value
 * @param {{ rootFontSize: number, fontSize: number, percentBasis: number,
 *           viewport: { width: number, height: number },
 *           container: { inlineSize: number } | null }} ctx
 * @returns {number}
 */
function resolveLength(value, ctx) {
  // TODO: only px works so far. Add rem, em, %, vw, vh and cqi, then the
  // clamp(), min() and max() functions with their "a + b" / "a - b" arguments.
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))px$/.exec(value.trim());
  if (!match) throw new Error(`Unsupported value: ${value}`);
  return Math.round(Number(match[1]) * 100) / 100;
}
