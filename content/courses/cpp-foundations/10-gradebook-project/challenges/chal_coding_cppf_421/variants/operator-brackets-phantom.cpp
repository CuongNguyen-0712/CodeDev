// Known wrong: add_score looks the id up with operator[], which inserts a default Student (empty name, no scores) for an unknown id; the error line is printed but the phantom student shows up in every later report.
// Riverside Polytechnic exam office: the CS101 grade book, rebuilt in C++23.
//
// Input (stdin): one command per line. Empty lines are ignored.
//   add <id> <full name>   register a student; the name is the rest of the line (UTF-8, may contain spaces)
//   score <id> <score>     record one score from 0 to 10 (at most one decimal, e.g. 8.5)
//   drop <id>              the student dropped the course: remove them and all their scores
//   report                 print the report
// The test runner at the bottom parses every line, calls your member functions and prints
// the error lines and the report lines. You write the four GradeBook member functions.
//
// Rules:
//   add_student(id, name)  returns false and changes nothing if the id is already in the book.
//   add_score(id, score)   returns false and changes nothing if the id is unknown.
//                          It must NOT create a student.
//   drop(id)               returns false and changes nothing if the id is unknown.
//                          A dropped id can be added again later; it then starts with no scores.
//   report()               returns the report lines (it is const: it changes nothing):
//     line 1:  "students: N"                       N = number of students in the book
//     then one line per student, sorted by id (std::string order, which std::map gives you):
//              "<id> | <name> | scores <count> | avg <average> | <letter>"
//     average: the arithmetic mean of all the student's scores, rounded ONCE to 2 decimals with
//              std::round(mean * 100) / 100 and printed with exactly 2 decimals
//              (std::fixed << std::setprecision(2); the runner prints with std::cout).
//     letter:  decided from that rounded average (the number printed), on the 10-point scale:
//              >= 8.5 A, >= 8.0 B+, >= 7.0 B, >= 6.5 C+, >= 5.5 C, >= 5.0 D+, >= 4.0 D, otherwise F
//     a student with no scores: "avg -" and the letter "-"
//
// Lines printed by the test runner (not by you):
//   "error: <id> already exists"     when add_student returns false
//   "error: unknown id <id>"         when add_score or drop returns false
//   "error: bad command: <line>"     for a line it cannot parse (wrong command, bad or out-of-range score)
//
// Example input:                         Output:
//   add RP-2024-0152 Trần Thị Bích Ngọc    error: unknown id RP-2024-0999
//   add RP-2024-0137 Nguyễn Văn An         students: 2
//   score RP-2024-0137 8.0                 RP-2024-0137 | Nguyễn Văn An | scores 2 | avg 8.50 | A
//   score RP-2024-0137 9.0                 RP-2024-0152 | Trần Thị Bích Ngọc | scores 0 | avg - | -
//   score RP-2024-0999 7.0
//   report

#include <cmath>
#include <iomanip>
#include <iostream>
#include <map>
#include <numeric>
#include <sstream>
#include <string>
#include <vector>

struct Student {
    std::string name;
    std::vector<double> scores;
};

class GradeBook {
public:
    bool add_student(const std::string& id, const std::string& name) {
        return students_.emplace(id, Student{name, {}}).second;
    }

    bool add_score(const std::string& id, double score) {
        Student& student = students_[id];
        if (student.name.empty()) return false;
        student.scores.push_back(score);
        return true;
    }

    bool drop(const std::string& id) {
        return students_.erase(id) > 0;
    }

    std::vector<std::string> report() const {
        std::vector<std::string> lines{"students: " + std::to_string(students_.size())};
        for (const auto& [id, student] : students_) {
            const auto& s = student.scores;
            if (s.empty()) {
                lines.push_back(id + " | " + student.name + " | scores 0 | avg - | -");
                continue;
            }
            double mean = std::accumulate(s.begin(), s.end(), 0.0) / static_cast<double>(s.size());
            double avg = std::round(mean * 100) / 100;
            const char* letter = avg >= 8.5 ? "A"
                               : avg >= 8.0 ? "B+"
                               : avg >= 7.0 ? "B"
                               : avg >= 6.5 ? "C+"
                               : avg >= 5.5 ? "C"
                               : avg >= 5.0 ? "D+"
                               : avg >= 4.0 ? "D"
                               : "F";
            std::ostringstream out;
            out << id << " | " << student.name << " | scores " << s.size()
                << " | avg " << std::fixed << std::setprecision(2) << avg << " | " << letter;
            lines.push_back(out.str());
        }
        return lines;
    }

private:
    std::map<std::string, Student> students_;
};

// ---- test runner (do not change) ----
// Reads the commands line by line, calls the GradeBook and prints error lines and reports.
int main() {
    GradeBook book;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        std::istringstream in(line);
        std::string cmd, id;
        if (!(in >> cmd)) continue;  // empty line
        if (cmd == "report") {
            for (const auto& out : book.report()) std::cout << out << '\n';
            continue;
        }
        if (!(in >> id)) { std::cout << "error: bad command: " << line << '\n'; continue; }
        if (cmd == "add") {
            std::string name;
            std::getline(in >> std::ws, name);
            if (name.empty()) { std::cout << "error: bad command: " << line << '\n'; continue; }
            if (!book.add_student(id, name)) std::cout << "error: " << id << " already exists\n";
        } else if (cmd == "score") {
            double score = 0;
            std::string rest;
            if (!(in >> score) || (in >> rest) || score < 0 || score > 10) {
                std::cout << "error: bad command: " << line << '\n';
                continue;
            }
            if (!book.add_score(id, score)) std::cout << "error: unknown id " << id << '\n';
        } else if (cmd == "drop") {
            if (!book.drop(id)) std::cout << "error: unknown id " << id << '\n';
        } else {
            std::cout << "error: bad command: " << line << '\n';
        }
    }
}
