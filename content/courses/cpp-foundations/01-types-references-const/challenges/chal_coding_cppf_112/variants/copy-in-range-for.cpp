// WRONG: for (auto s : scores) curves a copy of each element, so the caller's vector never changes.
// Riverside Polytechnic exam office - apply a bonus curve to one class's scores.
//
// The exam board grants a bonus to every student in a class. Write two functions:
//
//   int apply_curve(std::vector<double>& scores, double bonus)
//     - adds bonus to every score IN PLACE (the caller's vector must change),
//     - caps every result at max_score (10.0): a score never ends above 10.0,
//     - returns how many scores actually changed value. A score that was already 10.0
//       stays 10.0 and does not count; with bonus 0.0 nothing changes.
//
//   double average(const std::vector<double>& scores)
//     - returns the mean of the scores as a double (no rounding, no integer division).
//       The list always has at least one score.
//
// Input (stdin):  line 1: the bonus (0.0 to 2.0), line 2: n (number of students, n >= 1),
//                 then n lines "<student id> <score>" with scores from 0.0 to 10.0.
// Output:         one line per student "<id> <score>" with 1 decimal (after the curve),
//                 then "changed: <count>" and "average: <mean with 2 decimals>".
//
// Example input:
//   0.5
//   4
//   RP-2024-0137 7.5
//   RP-2024-0138 9.8
//   RP-2024-0139 10.0
//   RP-2024-0140 5.9
// Example output:
//   RP-2024-0137 8.0
//   RP-2024-0138 10.0
//   RP-2024-0139 10.0
//   RP-2024-0140 6.4
//   changed: 3
//   average: 8.60
#include <cstddef>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>

constexpr double max_score = 10.0;

int apply_curve(std::vector<double>& scores, double bonus) {
    int changed = 0;
    for (auto s : scores) {
        double curved = s + bonus;
        if (curved > max_score) curved = max_score;
        if (curved != s) ++changed;
        s = curved;
    }
    return changed;
}

double average(const std::vector<double>& scores) {
    double total = 0.0;
    for (double s : scores) total += s;
    return total / static_cast<double>(scores.size());
}

// ---- test runner (do not change) ----
int main() {
    double bonus = 0.0;
    std::size_t n = 0;
    std::cin >> bonus >> n;
    std::vector<std::string> ids(n);
    std::vector<double> scores(n);
    for (std::size_t i = 0; i < n; ++i) std::cin >> ids[i] >> scores[i];

    int changed = apply_curve(scores, bonus);

    std::cout << std::fixed << std::setprecision(1);
    for (std::size_t i = 0; i < n; ++i) std::cout << ids[i] << ' ' << scores[i] << '\n';
    std::cout << "changed: " << changed << '\n';
    std::cout << "average: " << std::setprecision(2) << average(scores) << '\n';
}
