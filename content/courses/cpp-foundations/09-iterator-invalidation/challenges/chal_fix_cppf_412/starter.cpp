// Riverside Polytechnic exam office: clean up a class roster before the exam list is printed.
//
// The roster export has one row per enrolment. Before the exam the office needs a clean list:
//   1. Remove every row whose status is W (withdrawn).
//   2. Then, among the rows that are left, keep only the FIRST row for each student id
//      (the export repeats a student when the enrolment was edited). Later rows with the
//      same id are removed.
//   3. Everything else stays, in the original order.
// clean_roster() changes the roster in place and returns how many rows it removed in total.
//
// Input (stdin):
//   line 1: N, the number of rows
//   N lines: <id> <status> <full name>     status is A (active) or W (withdrawn); the name may contain spaces
// Output (printed by the test runner):
//   removed <count>
//   exam list: <size>
//   one line per remaining student: <id> <full name>
//
// Example:
//   input                                  output
//   5                                      removed 3
//   RP-2024-0101 A Nguyễn Văn An           exam list: 2
//   RP-2024-0137 W Trần Thị Bích           RP-2024-0101 Nguyễn Văn An
//   RP-2024-0142 W Lê Minh Châu            RP-2024-0158 Phạm Quốc Dũng
//   RP-2024-0158 A Phạm Quốc Dũng
//   RP-2024-0101 A Nguyễn Văn An
//
// The code below was ported from the 2010 C tool. On the day of the CS101 exam, two withdrawn
// students in a row left one of them on the list. Fix clean_roster().
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::string name;
    bool withdrawn;
};

std::size_t clean_roster(std::vector<Student>& roster) {
    std::size_t removed = 0;
    for (std::size_t i = 0; i < roster.size(); ++i) {
        if (roster[i].withdrawn) {
            roster.erase(roster.begin() + i);
            ++removed;
        }
    }
    for (std::size_t i = 0; i < roster.size(); ++i) {
        for (std::size_t j = i + 1; j < roster.size(); ++j) {
            if (roster[j].id == roster[i].id) {
                roster.erase(roster.begin() + j);
                ++removed;
            }
        }
    }
    return removed;
}

// ---- test runner (do not change) ----
int main() {
    std::string line;
    std::getline(std::cin, line);
    const int n = std::stoi(line);
    std::vector<Student> roster;
    for (int i = 0; i < n && std::getline(std::cin, line); ++i) {
        std::istringstream in(line);
        Student s;
        std::string status;
        in >> s.id >> status;
        std::getline(in >> std::ws, s.name);
        s.withdrawn = status == "W";
        roster.push_back(s);
    }
    const std::size_t removed = clean_roster(roster);
    std::cout << "removed " << removed << "\n";
    std::cout << "exam list: " << roster.size() << "\n";
    for (const Student& s : roster)
        std::cout << s.id << " " << s.name << "\n";
}
