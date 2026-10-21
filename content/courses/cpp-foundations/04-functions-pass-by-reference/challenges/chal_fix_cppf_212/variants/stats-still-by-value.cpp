// Known wrong: fixes the retake and the rounding, but record() still takes ClassStats by value, so every update lands in a copy and the class line stays at students=0 passed=0 best=-.
// Riverside Polytechnic exam office - CS101 transcript lines and the class summary.
//
// The transcript job was ported from C, and the transcripts it prints are wrong: retake
// scores never appear, averages come out with too many decimals, and the class summary
// says nobody passed. Every function compiles and looks fine on its own. Find the
// parameter and return-value bugs and fix them. The rules:
//
//   apply_retake(quiz, retake)
//     - if the retake score is HIGHER than the student's lowest quiz score, it replaces
//       that lowest score in the student's quiz list (the first one if the lowest score
//       appears twice). Otherwise nothing changes. A retake of 0.0 means "did not sit it".
//   average(quiz)       the mean of all quiz scores (at least one score).
//   round_one_decimal   rounds a value to one decimal with std::round(value * 10) / 10,
//                       so 7.625 becomes 7.6 and 7.25 becomes 7.3.
//   make_line(student)  the transcript line: the quiz list after the retake rule and the
//                       rounded average.
//   record(stats, line) adds one transcript line to the class summary: one more student,
//                       one more pass if the rounded average is >= 5.0, and the best
//                       average so far (on a tie the student who came first stays best).
//
// Input (stdin):  line 1: n (n >= 1), then n lines "<id> <retake> <k> <q1> ... <qk>"
//                 with k >= 1 quiz scores from 0.0 to 10.0.
// Output:         one line per student "<id> quiz=[...] average=<avg with 2 decimals>",
//                 then "class: students=<n> passed=<p> best=<id> (<best average>)".
//
// Example input:
//   2
//   RP-2024-0137 6.0 4 8.5 7.0 9.0 4.5
//   RP-2024-0138 0.0 3 4.0 5.5 4.9
// Example output:
//   RP-2024-0137 quiz=[8.5, 7.0, 9.0, 6.0] average=7.60
//   RP-2024-0138 quiz=[4.0, 5.5, 4.9] average=4.80
//   class: students=2 passed=1 best=RP-2024-0137 (7.60)
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>

struct Student {
    std::string id;
    double retake = 0.0;
    std::vector<double> quiz;
};

struct TranscriptLine {
    std::string id;
    std::vector<double> quiz;
    double average = 0.0;
};

struct ClassStats {
    int students = 0;
    int passed = 0;
    std::string best_id = "-";
    double best_average = -1.0;
};

void apply_retake(std::vector<double>& quiz, double retake) {
    auto lowest = std::ranges::min_element(quiz);
    if (retake > *lowest) *lowest = retake;
}

double average(const std::vector<double>& quiz) {
    double sum = 0.0;
    for (double q : quiz) sum += q;
    return sum / static_cast<double>(quiz.size());
}

double round_one_decimal(double value) {
    return std::round(value * 10) / 10;
}

TranscriptLine make_line(const Student& student) {
    TranscriptLine line{student.id, student.quiz, 0.0};
    apply_retake(line.quiz, student.retake);
    line.average = average(line.quiz);
    line.average = round_one_decimal(line.average);
    return line;
}

void record(ClassStats stats, const TranscriptLine& line) {
    ++stats.students;
    if (line.average >= 5.0) ++stats.passed;
    if (line.average > stats.best_average) {
        stats.best_average = line.average;
        stats.best_id = line.id;
    }
}

// ---- test runner (do not change) ----
int main() {
    std::size_t n = 0;
    std::cin >> n;
    std::vector<Student> students(n);
    for (Student& s : students) {
        std::size_t k = 0;
        std::cin >> s.id >> s.retake >> k;
        s.quiz.resize(k);
        for (double& q : s.quiz) std::cin >> q;
    }

    ClassStats stats;
    for (const Student& s : students) {
        TranscriptLine line = make_line(s);
        record(stats, line);
        std::cout << line.id << " quiz=[" << std::fixed << std::setprecision(1);
        for (std::size_t i = 0; i < line.quiz.size(); ++i)
            std::cout << (i == 0 ? "" : ", ") << line.quiz[i];
        std::cout << "] average=" << std::setprecision(2) << line.average << '\n';
    }
    std::cout << "class: students=" << stats.students << " passed=" << stats.passed
              << " best=" << stats.best_id << " (" << std::setprecision(2) << stats.best_average << ")\n";
}
