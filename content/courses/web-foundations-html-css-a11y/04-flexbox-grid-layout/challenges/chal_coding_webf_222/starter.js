/**
 * Compute the width of every column track of a CSS grid, in px.
 *
 * gridColumns({ template, width, gap, items }) returns an array of numbers: the width of each
 * column track, left to right.
 *
 *   - width     the grid container's content width in px (a number > 0)
 *   - gap       the column gap in px (a number >= 0); there is one gap BETWEEN two neighbouring
 *               tracks, none before the first or after the last (n tracks -> n - 1 gaps)
 *   - items     how many grid items the grid holds (an integer >= 1); it only matters for auto-fit
 *   - template  the value of grid-template-columns, in ONE of these two forms (always valid):
 *
 *   1. A list of tracks separated by single spaces, e.g. "200px 1fr", "25% 1fr 100px", "1fr 2fr 1fr".
 *      Each track is one of:
 *        Npx  a fixed width of N px                      (N: digits, optionally ".digits")
 *        N%   N percent of the container width            (N: digits, optionally ".digits")
 *        Nfr  a share of the free space                   (N: an integer >= 1)
 *      free space = width - (all px and % tracks) - (all gaps); if that is negative, it is 0.
 *      The fr tracks share the free space in proportion to N: a "2fr" track gets twice as much
 *      as a "1fr" track. With no free space, every fr track is 0 (px and % tracks keep their width,
 *      even if the grid then overflows the container).
 *      Assume content always fits: an fr track has no content minimum (like minmax(0, Nfr)).
 *
 *   2. The whole template is one auto-repeat, written exactly like this (one space after each comma):
 *        "repeat(auto-fill, minmax(Npx, 1fr))"   or   "repeat(auto-fit, minmax(Npx, 1fr))"
 *      with N > 0 (digits, optionally ".digits"). Call N the minimum, min.
 *      - Number of tracks: count = max(1, floor((width + gap) / (min + gap))), the largest number of
 *        min-wide tracks that fit together with the gaps between them (at least 1).
 *      - auto-fill: every one of the count tracks exists, filled or empty. Each is
 *        (width - (count - 1) * gap) / count wide, but never narrower than min (with one track and a
 *        container narrower than min, the track is min wide and overflows).
 *      - auto-fit: same count, but when items < count, the last (count - items) tracks are EMPTY and
 *        collapse to 0, together with the gaps next to them. The used = min(items, count) filled tracks
 *        then share the width: each is (width - (used - 1) * gap) / used wide (never narrower than
 *        min). Return all count tracks: the filled widths first, then a 0 for each collapsed track.
 *
 * Round every width to 2 decimals with Math.round(x * 100) / 100.
 *
 * Examples:
 *   gridColumns({ template: "200px 1fr", width: 1000, gap: 16, items: 2 })            -> [200, 784]
 *   gridColumns({ template: "repeat(auto-fill, minmax(300px, 1fr))", width: 1000, gap: 20, items: 9 })
 *                                                                                     -> [320, 320, 320]
 *
 * @param {{ template: string, width: number, gap: number, items: number }} grid
 * @returns {number[]}
 */
function gridColumns({ template, width, gap, items }) {
  // TODO: detect the repeat(...) form with a regular expression; otherwise split the template
  // on spaces, add up the fixed tracks and the fr shares, subtract the gaps, then share the rest.
  return [];
}
