// Known wrong: fixes the header and checks every record, but keeps while (!in.eof()): after the last line the loop runs once more, reads an empty line and reports an extra bad line.
// Riverside Polytechnic exam office: read one course's score file and print a checked report.
//
// Input (stdin):
//   line 1: the course code, one word, e.g. CS101
//   every following line is one record:  <student id> <score> <full name>
//     - fields are separated by one or more spaces
//     - the full name is the REST of the line after the score (it may contain spaces);
//       spaces before the name are not part of it
//   the file ends at end of input (the last line may or may not end with a newline)
//
// A record line is BAD if any of these is true:
//   - the line is empty or has only spaces, or the id or the score is missing
//   - the score is not a plain number that uses the whole score field
//     ("8.5" and "7" are fine; "8,5", "abc", "8.5x" are bad)
//   - the score is outside 0..10
//   - the name is missing (nothing after the score)
// A bad line must not stop the program: report it and continue with the next line.
//
// Output (stdout), in this order:
//   - the course code on its own line
//   - for each line after the header, in file order:
//       good line:  <id> | <name> | <score with 1 decimal>
//       bad line:   bad line <n>: <the line exactly as read>
//     where <n> is the line number in the file (the header is line 1)
//   - a last line:  records: <good count>, bad: <bad count>, average: <average of good scores, 2 decimals>
//     or, when there are no good records:  records: 0, bad: <bad count>, average: n/a
//
// Example
//   input:
//     CS101
//     RP-2024-0137 8.5 Nguyễn Thị Phương Thảo
//     RP-2024-0138 8,5 Trần Văn An
//     RP-2024-0139 7 Lê Minh
//   output:
//     CS101
//     RP-2024-0137 | Nguyễn Thị Phương Thảo | 8.5
//     bad line 3: RP-2024-0138 8,5 Trần Văn An
//     RP-2024-0139 | Lê Minh | 7.0
//     records: 2, bad: 1, average: 7.75
//
// The ported reader below prints an empty record first, prints one more empty record at the
// end, and turns "8,5" into a score of 8. Fix process_score_file.

#include <charconv>
#include <iostream>
#include <iomanip>
#include <sstream>
#include <string>

void process_score_file(std::istream& in) {
    std::string course;
    std::getline(in, course);  // the whole header line, newline included
    std::cout << course << '\n';

    int records = 0;
    int bad = 0;
    double total = 0;
    int line_no = 1;
    std::string line;
    while (!in.eof()) {
        std::getline(in, line);
        ++line_no;
        std::istringstream row(line);
        std::string id, score_text, name;
        double score = 0;
        bool ok = false;
        if (row >> id >> score_text) {
            const char* first = score_text.data();
            const char* last = first + score_text.size();
            auto [end, ec] = std::from_chars(first, last, score);
            std::getline(row >> std::ws, name);
            ok = ec == std::errc{} && end == last && score >= 0 && score <= 10 && !name.empty();
        }
        if (!ok) {
            ++bad;
            std::cout << "bad line " << line_no << ": " << line << '\n';
            continue;
        }
        std::cout << id << " | " << name << " | " << std::fixed << std::setprecision(1) << score << '\n';
        total += score;
        ++records;
    }

    if (records == 0) {
        std::cout << "records: 0, bad: " << bad << ", average: n/a\n";
    } else {
        std::cout << "records: " << records << ", bad: " << bad << ", average: " << std::fixed << std::setprecision(2) << total / records << '\n';
    }
}

// ---- test runner (do not change) ----
int main() {
    process_score_file(std::cin);
}
