// Riverside Polytechnic - scholarship ranking (exam office tool, ported from C to C++23).
//
// Write three functions. The test runner at the bottom reads the cohort, calls them and prints
// the ranking.
//
//   double average_of(const std::vector<double>& scores)
//     The mean of one student's scores (scores is never empty; every score is 0-10).
//     Do not round: 9.5 9.5 9.5 8.5 -> 9.25, not 9 and not 8.
//
//   void rank_students(std::vector<Student>& students)
//     Sort the cohort IN PLACE into scholarship order:
//       1. higher average first;
//       2. equal averages: smaller student id first ("RP-2024-0052" before "RP-2024-0137").
//     Every student already has .average filled in by the runner.
//
//   long count_at_least(const std::vector<Student>& students, double threshold)
//     How many students have an average >= threshold (an average of exactly 8.00 counts for 8.0).
//
// Input (stdin):
//   line 1: K, how many places to print (K may be larger than the cohort: then print everyone)
//   then one line per student:  id|full name|score score score ...
//   Names are UTF-8 and contain spaces; scores are separated by single spaces.
//
// Output (printed by the runner):
//   one line per printed place:  "<rank>. <id> <name> <average with 2 decimals>"
//   then:                        "at least 8.00: <count> of <cohort size>"
//
// Example input:
//   2
//   RP-2024-0137|Nguyễn Văn An|9.5 9.5 9.5 8.5
//   RP-2024-0052|Lê Thị Hồng|9 9 9 9
//   RP-2024-0219|Phạm Minh Khoa|8 7.5 8 7.5
// Example output:
//   1. RP-2024-0137 Nguyễn Văn An 9.25
//   2. RP-2024-0052 Lê Thị Hồng 9.00
//   at least 8.00: 2 of 3
#include <algorithm>
#include <cstddef>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <sstream>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::string name;
    std::vector<double> scores;
    double average = 0.0;
};

double average_of(const std::vector<double>& scores) {
    // TODO: the mean of all scores (std::accumulate is in <numeric>).
    return scores.front();
}

void rank_students([[maybe_unused]] std::vector<Student>& students) {
    // TODO: sort into scholarship order - higher average first, equal averages by smaller id.
}

long count_at_least([[maybe_unused]] const std::vector<Student>& students, [[maybe_unused]] double threshold) {
    // TODO: how many students have average >= threshold.
    return 0;
}

// ---- test runner (do not change) ----
int main() {
    std::size_t k = 0;
    std::string line;
    std::getline(std::cin, line);
    k = std::stoul(line);

    std::vector<Student> students;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        std::size_t bar1 = line.find('|');
        std::size_t bar2 = line.find('|', bar1 + 1);
        Student s;
        s.id = line.substr(0, bar1);
        s.name = line.substr(bar1 + 1, bar2 - bar1 - 1);
        std::istringstream in(line.substr(bar2 + 1));
        for (double score; in >> score;) s.scores.push_back(score);
        s.average = average_of(s.scores);
        students.push_back(s);
    }

    rank_students(students);
    for (std::size_t i = 0; i < students.size() && i < k; ++i)
        std::cout << i + 1 << ". " << students[i].id << ' ' << students[i].name << ' ' << std::fixed
                  << std::setprecision(2) << students[i].average << '\n';
    std::cout << "at least 8.00: " << count_at_least(students, 8.0) << " of " << students.size() << '\n';
}
