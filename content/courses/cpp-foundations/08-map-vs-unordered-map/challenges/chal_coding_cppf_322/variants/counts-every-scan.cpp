// Known wrong: stores every scan in a vector instead of a set of sessions, so a card scanned twice in the same session counts twice.
// Riverside Polytechnic exam office: attendance report for one class.
//
// Write attendance_report(roster, checkins, queries). It returns the lines of the report.
//
// Input (read by the test runner below):
//   n             number of students on the class list, then n lines: one student id each
//                 (no duplicates, in any order)
//   m             number of card scans, then m lines: "<session> <student id>", e.g. "3 RP-2024-0142"
//   q             number of ids the faculty office asks about, then q lines: one id each
//
// Rules:
//   - Every student on the class list is in the report, also with 0 sessions.
//   - A student's count is the number of DIFFERENT sessions they scanned their card in:
//     scanning twice in the same session counts once.
//   - A scan by an id that is not on the class list (a student of another class, a misread card)
//     is ignored: it is not counted and that id does not join the class.
//   - Asking about an id never changes the class.
//
// Output lines, in this order:
//   1. one line per query, in the order asked: "<id>: <sessions>" for a student on the class
//      list (also "<id>: 0"), "<id>: unknown" for any other id;
//   2. one line per student on the class list, sorted by id (std::string order): "<id>,<sessions>";
//   3. the last line: "class size: <number of students on the class list>".
//
// Example
//   input:                 output:
//   3                      RP-2024-0150: 2
//   RP-2024-0150           RP-2024-0999: unknown
//   RP-2024-0137           RP-2024-0137,1
//   RP-2024-0142           RP-2024-0142,0
//   4                      RP-2024-0150,2
//   1 RP-2024-0150         class size: 3
//   1 RP-2024-0137
//   1 RP-2024-0150
//   2 RP-2024-0150
//   2
//   RP-2024-0150
//   RP-2024-0999
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <vector>

struct CheckIn {
    int session;
    std::string id;
};

std::vector<std::string> attendance_report(const std::vector<std::string>& roster,
                                           const std::vector<CheckIn>& checkins,
                                           const std::vector<std::string>& queries) {
    // id -> the sessions that student attended; std::map keeps the ids sorted
    std::map<std::string, std::vector<int>> sessions;
    for (const auto& id : roster) {
        sessions.try_emplace(id);
    }
    for (const auto& scan : checkins) {
        if (auto it = sessions.find(scan.id); it != sessions.end()) {
            it->second.push_back(scan.session);
        }
    }

    std::vector<std::string> lines;
    for (const auto& id : queries) {
        if (auto it = sessions.find(id); it != sessions.end()) {
            lines.push_back(id + ": " + std::to_string(it->second.size()));
        } else {
            lines.push_back(id + ": unknown");
        }
    }
    for (const auto& [id, attended] : sessions) {
        lines.push_back(id + "," + std::to_string(attended.size()));
    }
    lines.push_back("class size: " + std::to_string(sessions.size()));
    return lines;
}

// ---- test runner (do not change) ----
int main() {
    std::size_t n = 0, m = 0, q = 0;
    std::cin >> n;
    std::vector<std::string> roster(n);
    for (auto& id : roster) std::cin >> id;
    std::cin >> m;
    std::vector<CheckIn> checkins(m);
    for (auto& scan : checkins) std::cin >> scan.session >> scan.id;
    std::cin >> q;
    std::vector<std::string> queries(q);
    for (auto& id : queries) std::cin >> id;

    for (const auto& line : attendance_report(roster, checkins, queries)) {
        std::cout << line << '\n';
    }
}
