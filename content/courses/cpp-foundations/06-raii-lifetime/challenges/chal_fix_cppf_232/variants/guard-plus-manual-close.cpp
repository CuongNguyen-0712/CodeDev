// Known wrong: uses the guard but keeps the old close_handle() on the normal path, so the handle is closed twice for every student with valid scores.
// Riverside Polytechnic - transcript export, lab version.
//
// The exporter opens one handle per student with open_handle(), writes the scores with
// write_line() and must give the handle back with close_handle(). The exam office runs it for
// thousands of students in ONE process, so every handle that is not closed stays open until the
// job dies with "Too many open files".
//
// The bug: export_transcript() closes the handle only on its normal path. A student with no
// scores returns early, and a score outside 0-10 makes check_score() throw - both skip
// close_handle(). Fix it so that EVERY way out of export_transcript() closes the handle exactly
// once. The clean way: write a small RAII guard class that calls open_handle() in its
// constructor and close_handle() in its destructor, cannot be copied, and use it in
// export_transcript(). Do not change the lab API or the test runner.
//
// Rules for export_transcript(s) (unchanged by the fix):
//   - open the handle for "out/<id>.txt" first, for every student;
//   - no scores:  return "<id>: skipped (no scores)";
//   - otherwise, for each score in order: check_score(x), then write_line(handle, "<x with 1 decimal>");
//     at the end return "<id>: <count> scores, average <average with 1 decimal>";
//   - a score outside 0-10 throws std::out_of_range from check_score(); the exception must still
//     leave export_transcript() (the runner catches it and prints "<id>: error: <message>").
//
// Input (stdin):  first line N, then N lines "<id> <k> <score 1> ... <score k>".
// Output: one line per student, then "open handles: <n>" and "bad closes: <n>"
//         (a bad close is close_handle() on a handle that is not open, e.g. closing twice).
//
// Example:
//   input                              output
//   3                                  RP-2024-0137: 2 scores, average 8.0
//   RP-2024-0137 2 7.5 8.5             RP-2024-0138: skipped (no scores)
//   RP-2024-0138 0                     RP-2024-0139: error: score 12.0 out of range
//   RP-2024-0139 2 9.0 12.0            open handles: 0
//                                      bad closes: 0
#include <iomanip>
#include <iostream>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

// ---- lab API (do not change) ----
std::set<int> g_open;     // handles that are open right now
int g_next = 1;
int g_bad_closes = 0;

int open_handle(const std::string& path) {
    (void)path;            // the lab version does not touch the disk
    g_open.insert(g_next);
    return g_next++;
}

void close_handle(int h) {
    if (g_open.erase(h) == 0) ++g_bad_closes;
}

void write_line(int h, const std::string& text) {
    (void)text;
    if (!g_open.contains(h)) ++g_bad_closes;   // writing to a closed handle is as bad
}

// x with exactly one decimal, e.g. 9 -> "9.0", 8.16 -> "8.2"
std::string one_decimal(double x) {
    std::ostringstream out;
    out << std::fixed << std::setprecision(1) << x;
    return out.str();
}

void check_score(double x) {
    if (x < 0 || x > 10) throw std::out_of_range("score " + one_decimal(x) + " out of range");
}

struct Student {
    std::string id;
    std::vector<double> scores;
};

// ---- your code ----
// Owns one lab handle: opens it in the constructor, closes it in the destructor.
class HandleGuard {
public:
    explicit HandleGuard(const std::string& path) : h_(open_handle(path)) {}
    ~HandleGuard() { close_handle(h_); }
    HandleGuard(const HandleGuard&) = delete;             // one owner: no copies
    HandleGuard& operator=(const HandleGuard&) = delete;
    int get() const { return h_; }

private:
    int h_;
};

std::string export_transcript(const Student& s) {
    HandleGuard file("out/" + s.id + ".txt");   // closed on every way out of this function
    if (s.scores.empty()) {
        return s.id + ": skipped (no scores)";
    }
    double sum = 0;
    for (double x : s.scores) {
        check_score(x);
        write_line(file.get(), one_decimal(x));
        sum += x;
    }
    close_handle(file.get());
    return s.id + ": " + std::to_string(s.scores.size()) + " scores, average " +
           one_decimal(sum / static_cast<double>(s.scores.size()));
}

// ---- test runner (do not change) ----
int main() {
    int n = 0;
    std::cin >> n;
    for (int i = 0; i < n; ++i) {
        Student s;
        int k = 0;
        std::cin >> s.id >> k;
        s.scores.resize(k);
        for (double& x : s.scores) std::cin >> x;
        try {
            std::cout << export_transcript(s) << "\n";
        } catch (const std::exception& e) {
            std::cout << s.id << ": error: " << e.what() << "\n";
        }
    }
    std::cout << "open handles: " << g_open.size() << "\n";
    std::cout << "bad closes: " << g_bad_closes << "\n";
}
