// Known wrong: drop() frees the seat but never promotes the first waitlisted student, so the section stays under capacity while people wait.
// Riverside Polytechnic enrolment: a Section class that keeps its own rules.
//
// Write the class Section (constructor, enroll, drop). summary() is already written.
// You may add private members and helper functions; keep the public interface.
//
// Rules - the invariant Section must keep after every call:
//   - The number of enrolled students is between 0 and capacity (never more).
//   - A student id appears at most once in the whole section: enrolled OR waitlisted, never both, never twice.
//   - Students are kept in order: enrolled in the order they got their seat, waitlist first come first served.
//
// Section(code, capacity)
//   - capacity must be > 0, otherwise throw std::invalid_argument with exactly this message:
//         capacity must be > 0
//   - a new section has nobody enrolled and an empty waitlist.
// enroll(id) returns:
//   "duplicate"   if id is already enrolled or already on the waitlist (nothing changes)
//   "enrolled"    if there is a free seat (id is added at the end of the enrolled list)
//   "waitlisted"  if the section is full (id is added at the end of the waitlist)
// drop(id) returns:
//   "dropped"                if id was enrolled and the waitlist is empty
//   "dropped, promoted <ID>" if id was enrolled: the FIRST waitlisted student takes the seat
//                            (removed from the waitlist, added at the end of the enrolled list)
//   "left waitlist"          if id was on the waitlist (it is removed from it)
//   "not found"              otherwise
//
// Input (stdin): first line "<section code> <capacity>", then one command per line:
//   enroll <id>     or     drop <id>
// Output: one line "<command> <id>: <result>" per command, then the final summary().
// If the constructor throws, the runner prints "error: <what()>" and stops.
//
// Example
//   input:                 output:
//   CS101-02 2             enroll RP-01: enrolled
//   enroll RP-01           enroll RP-02: enrolled
//   enroll RP-02           enroll RP-03: waitlisted
//   enroll RP-03           drop RP-01: dropped, promoted RP-03
//   drop RP-01             CS101-02 2/2 enrolled=[RP-02,RP-03] waitlist=[]
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

class Section {
public:
    Section(std::string code, int capacity)
        : code_(std::move(code)), capacity_(capacity) {
        if (capacity_ <= 0) throw std::invalid_argument("capacity must be > 0");
    }

    std::string enroll(const std::string& id) {
        if (contains(enrolled_, id) || contains(waitlist_, id)) return "duplicate";
        if (static_cast<int>(enrolled_.size()) < capacity_) {
            enrolled_.push_back(id);
            return "enrolled";
        }
        waitlist_.push_back(id);
        return "waitlisted";
    }

    std::string drop(const std::string& id) {
        if (auto it = std::ranges::find(enrolled_, id); it != enrolled_.end()) {
            enrolled_.erase(it);
            return "dropped";
            std::string next = waitlist_.front();
            waitlist_.erase(waitlist_.begin());
            enrolled_.push_back(next);
            return "dropped, promoted " + next;
        }
        if (auto it = std::ranges::find(waitlist_, id); it != waitlist_.end()) {
            waitlist_.erase(it);
            return "left waitlist";
        }
        return "not found";
    }

    // Already written: "<code> <enrolled>/<capacity> enrolled=[a,b] waitlist=[c]"
    std::string summary() const {
        return code_ + " " + std::to_string(enrolled_.size()) + "/" + std::to_string(capacity_) +
               " enrolled=[" + join(enrolled_) + "] waitlist=[" + join(waitlist_) + "]";
    }

private:
    static bool contains(const std::vector<std::string>& ids, const std::string& id) {
        return std::ranges::find(ids, id) != ids.end();
    }
    static std::string join(const std::vector<std::string>& ids) {
        std::string out;
        for (const auto& id : ids) out += (out.empty() ? "" : ",") + id;
        return out;
    }

    std::string code_;
    int capacity_;
    std::vector<std::string> enrolled_;
    std::vector<std::string> waitlist_;
};

// ---- test runner (do not change) ----
int main() {
    std::string code;
    int capacity = 0;
    std::cin >> code >> capacity;
    try {
        Section section(code, capacity);
        std::string command, id;
        while (std::cin >> command >> id) {
            std::string result = command == "enroll" ? section.enroll(id)
                               : command == "drop"   ? section.drop(id)
                                                     : "unknown command";
            std::cout << command << " " << id << ": " << result << "\n";
        }
        const Section& view = section;   // summary() must work on a const Section
        std::cout << view.summary() << "\n";
    } catch (const std::invalid_argument& e) {
        std::cout << "error: " << e.what() << "\n";
    }
}
