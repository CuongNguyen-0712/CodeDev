// Riverside Polytechnic - class roster import (C++23 port of roster.c)
//
// The exam office exports each class roster as a text file, one student per line:
//
//     id;name;score            for example:   RP-2024-0137;Nguyễn Văn An;8.5
//
// The file is typed and edited by hand, so:
//   - Fields can have spaces around them:  "  RP-2024-0138 ;  Trần Thị Bích Ngọc ; 7.0  ".
//     Remove the spaces at the start and at the end of EACH field. Spaces inside a field stay
//     ("Trần Thị Bích Ngọc" keeps its single spaces). Only the space character ' ' counts.
//   - Empty lines and lines that contain only spaces are skipped.
//   - A line whose first non-space character is '#' is a comment and is skipped.
//   - Every other line has exactly two ';'. Names never contain ';'.
//   - The score stays text, exactly as written (after trimming): "8.5", "10", "7.25".
//
// Write:
//   1. trim(s)                  -> s without leading and trailing spaces ("" if only spaces).
//   2. parse_roster(lines)      -> one Student per roster line, in file order.
//   3. too_long_for_c(students) -> the ids of the students whose name does NOT fit the old C
//      field char name[24], in roster order. char name[24] holds 24 bytes INCLUDING the
//      terminating '\0', so a name fits only if it has at most 23 bytes. Count BYTES with
//      std::string::size(), not letters: "Trần Thị Bích Ngọc" is 18 letters but 25 bytes.
//
// Useful std::string members: find(ch, from), substr(pos, count), find_first_not_of(' '),
// find_last_not_of(' '), starts_with, empty, size. std::string::npos means "not found".
//
// Example input:
//     # CS101 group 2
//     RP-2024-0137;Nguyễn Văn An;8.5
//
//       RP-2024-0138 ;  Trần Thị Bích Ngọc ; 7.0
// Output printed by the test runner:
//     2 students
//     RP-2024-0137 | Nguyễn Văn An | 8.5 | 16 bytes
//     RP-2024-0138 | Trần Thị Bích Ngọc | 7.0 | 25 bytes
//     too long for char[24]: RP-2024-0138
// (or "too long for char[24]: none" when every name fits)

#include <iostream>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::string name;
    std::string score;
};

std::string trim(const std::string& s) {
    return s;  // TODO: remove leading and trailing spaces
}

std::vector<Student> parse_roster(const std::vector<std::string>& lines) {
    std::vector<Student> students;
    for (const std::string& line : lines) {
        // TODO: skip blank and comment lines, split at the two ';' and trim each field.
        students.push_back(Student{line, "", ""});
    }
    return students;
}

std::vector<std::string> too_long_for_c(const std::vector<Student>& students) {
    std::vector<std::string> ids;
    for (const Student& s : students) {
        // TODO: keep only the students whose name does not fit in char name[24].
        ids.push_back(s.id);
    }
    return ids;
}

// ---- test runner (do not change) ----
// Reads the whole roster file from stdin, calls your functions and prints the result.
int main() {
    std::vector<std::string> lines;
    std::string line;
    while (std::getline(std::cin, line)) lines.push_back(line);

    std::vector<Student> students = parse_roster(lines);
    std::cout << students.size() << " students\n";
    for (const Student& s : students)
        std::cout << s.id << " | " << s.name << " | " << s.score << " | " << s.name.size() << " bytes\n";

    std::vector<std::string> ids = too_long_for_c(students);
    std::string list;
    for (const std::string& id : ids) list += (list.empty() ? "" : " ") + id;
    std::cout << "too long for char[24]: " << (list.empty() ? "none" : list) << '\n';
}
