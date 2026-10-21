/**
 * Resolve the cascade for ONE property on ONE element: which declaration wins?
 *
 * Every declaration below matches the element and sets the same property (say `background`).
 * They all come from author style sheets (no user-agent or user styles, no shadow DOM).
 *
 * @param {string[]} layerOrder  cascade layer names, in the order they were declared
 *                               (`@layer reset, base, components;` -> ["reset", "base", "components"]).
 *                               Every layer name used by a declaration appears here.
 * @param {Array<{
 *   selector: string | null,    the rule's selector; null for a style attribute
 *   value: string,              the declared value, e.g. "#1d4ed8"
 *   layer: string | null,       the layer the rule is in; null = unlayered (always null for inline)
 *   important: boolean,         true for `!important`
 *   inline?: boolean            true for a declaration in the element's style="" attribute
 * }>} declarations              in order of appearance (index 0 appears first). At least one.
 *
 * @returns {{ index: number, value: string, specificity: [number, number, number] | null }}
 *   index        position of the winning declaration in `declarations`
 *   value        its value
 *   specificity  its selector's specificity [A, B, C], or null when the winner is inline
 *
 * Sorting order - compare two declarations with these steps; the FIRST step where they differ
 * decides, later steps are never looked at:
 *   1. Importance: an `!important` declaration beats a normal one.
 *   2. Style attribute: an inline declaration beats any rule with a selector (same importance).
 *   3. Layers: for NORMAL declarations, unlayered beats every layer, and a layer that appears
 *      later in layerOrder beats an earlier one. For IMPORTANT declarations this is reversed:
 *      an earlier layer beats a later one, and any layer beats unlayered.
 *      (Inline declarations are all unlayered, so two inline declarations tie here.)
 *   4. Specificity, compared column by column: the larger A wins; if equal, the larger B; if
 *      equal, the larger C. It is NOT a single number: (1,0,0) beats (0,11,0).
 *      (Two inline declarations tie here.)
 *   5. Order of appearance: the later declaration (larger index) wins.
 *
 * Specificity [A, B, C] of a selector:
 *   A = number of id selectors, B = classes + attribute selectors + pseudo-classes,
 *   C = type selectors + pseudo-elements. Universal `*` and combinators add nothing.
 *
 * Selector grammar (nothing else appears in the tests):
 *   A selector is one or more compound selectors joined by combinators: whitespace (descendant),
 *   ">", "+" or "~". Spaces around ">", "+" and "~" are optional. There are no selector lists
 *   (no top-level commas). A compound selector is a run of simple selectors with no spaces:
 *     *                              universal        adds nothing
 *     button, h1, input              type             C + 1
 *     #pay                           id               A + 1
 *     .btn-primary                   class            B + 1
 *     [disabled], [type="submit"]    attribute        B + 1  (no spaces, "]" or parentheses inside)
 *     ::before, ::placeholder        pseudo-element   C + 1  (always written with two colons)
 *     :hover, :nth-child(2n+1)       pseudo-class     B + 1  (its argument, if any, is ignored)
 *     :is(L), :not(L), :has(L)       the LARGEST specificity among the selectors in L
 *     :where(L)                      adds nothing, whatever L contains
 *   L is a comma-separated list (", " or ",") of selectors built from the rows above, except that
 *   L never contains :is, :not, :has, :where or any parentheses. An item inside :has() may start
 *   with a combinator, as in `:has(> img)`. Names after #, ., :, :: and type names use letters,
 *   digits, "-" and "_" (a type name starts with a letter).
 *
 * Examples:
 *   specificity("ul li.active > a:hover")      -> [0, 2, 3]
 *   specificity(":is(.card, #main) h2")        -> [1, 0, 1]
 *   specificity(":where(.card) h2::first-line")-> [0, 0, 2]
 */
function cascadeWinner(layerOrder, declarations) {
  // TODO: compare the declarations with the five steps above.
  // For now the last declaration always wins, which is only step 5.
  const index = declarations.length - 1;
  return { index, value: declarations[index].value, specificity: [0, 0, 0] };
}
