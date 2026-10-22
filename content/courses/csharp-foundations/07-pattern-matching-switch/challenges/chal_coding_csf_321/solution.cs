// Sen Academy - the monthly tuition rules, rewritten with switch expressions.
//
// Input (stdin): one enrollment per line, four fields separated by spaces:
//   STUDENT   student id, e.g. HS-1024
//   KIND      Group, Private, Online or Camp (any letter case)
//   SESSIONS  sessions booked this month (a whole number, may be 0)
//   SIBLINGS  children of the family enrolled this month, this student included (1 or more)
//
// The rules:
//   Base price   Group 150000 VND per session, Private 400000 per session, Online 100000 per session,
//                Camp a flat 2500000 for the month (its sessions do not matter).
//   Volume       Group or Online with 12 or more sessions: 10%. Private with 8 or more sessions: 5%.
//                Nothing for fewer sessions, nothing for Camp.
//   Siblings     2 siblings: 10%. 3 or more: 15%. Camp never gets a sibling discount.
//   Discount     volume + siblings, but never more than 20%.
//   Fee          base * (100 - discount) / 100, in whole VND (it is always a whole number with these prices).
//   A Group, Private or Online enrollment with 0 sessions is not billed: "HS-1024: no sessions".
//
// Write BasePrice, DiscountPercent and Bill. Bill returns the line the test runner prints:
//   STUDENT KIND: FEE VND (base BASE, discount D%)
//
// Example input:
//   HS-1024 Group 8 1
//   HS-1025 Group 12 2
//   HS-1026 Private 8 1
// Expected output:
//   HS-1024 Group: 1200000 VND (base 1200000, discount 0%)
//   HS-1025 Group: 1440000 VND (base 1800000, discount 20%)
//   HS-1026 Private: 3040000 VND (base 3200000, discount 5%)
//
// The record Enrollment and the enum ClassKind are declared at the very end of the file.

// BasePrice returns the price before any discount.
static decimal BasePrice(Enrollment e) => e.Kind switch
{
    ClassKind.Group => 150_000m * e.Sessions,
    ClassKind.Private => 400_000m * e.Sessions,
    ClassKind.Online => 100_000m * e.Sessions,
    ClassKind.Camp => 2_500_000m,
    _ => throw new ArgumentOutOfRangeException(nameof(e), e.Kind, "no price for this class kind"),
};

// DiscountPercent returns the volume discount plus the sibling discount, capped at 20.
static int DiscountPercent(Enrollment e)
{
    int volume = e switch
    {
        { Kind: ClassKind.Group or ClassKind.Online, Sessions: >= 12 } => 10,
        { Kind: ClassKind.Private, Sessions: >= 8 } => 5,
        _ => 0,
    };
    int siblings = e switch
    {
        { Kind: ClassKind.Camp } => 0,
        { Siblings: >= 3 } => 15,
        { Siblings: 2 } => 10,
        _ => 0,
    };
    return Math.Min(volume + siblings, 20);
}

// Bill returns the line for one enrollment (see the format above).
static string Bill(Enrollment e)
{
    if (e is { Kind: not ClassKind.Camp, Sessions: <= 0 })
        return $"{e.StudentId}: no sessions";

    decimal basePrice = BasePrice(e);
    int discount = DiscountPercent(e);
    long fee = (long)(basePrice * (100 - discount) / 100);
    return $"{e.StudentId} {e.Kind}: {fee} VND (base {(long)basePrice}, discount {discount}%)";
}

// ---------------------------------------------------------------- test runner (do not change)
foreach (string line in Console.In.ReadToEnd().Split('\n'))
{
    string[] f = line.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    if (f.Length == 0) continue;
    var e = new Enrollment(f[0], Enum.Parse<ClassKind>(f[1], ignoreCase: true), int.Parse(f[2]), int.Parse(f[3]));
    Console.WriteLine(Bill(e));
}

// ---------------------------------------------------------------- types
record Enrollment(string StudentId, ClassKind Kind, int Sessions, int Siblings);
enum ClassKind { Group, Private, Online, Camp }
