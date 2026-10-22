// Sen Academy - the 06:00 late-fee reminder job.
//
// Every unpaid invoice that is more than graceDays days late gets ONE reminder: one row in the
// outbox (ids 501, 502, ... in the order the rows are queued) and one SMS to the parents, in the
// order of the invoices. In the first month of term the grace period is 3 days instead of graceDays.
// The late fee is 2% of the invoice (LateFee).
//
// The job prints:
//   [log] N reminders to send               N = the number of reminders the job really sends
//   [sms] #ID to the parents of STUDENT: late fee F VND      one line per reminder
//   [log] late fees total T VND              the sum of the fees of those reminders
// Then the test runner prints the outbox rows.
//
// Input (stdin):
//   grace N                                   graceDays from the settings
//   first-month yes|no                        is this the first month of term?
//   STUDENT AMOUNT DAYSLATE paid|unpaid       one invoice per line
//
// The bug: Bùi Thị Hạnh finds the same student two or three times in the outbox, every copy with
// another id, and the number in the first log line does not match the SMS that were sent.
// Fix RunReminderJob. Do not change LateFee, the test runner or the types at the bottom.

static void RunReminderJob(List<Invoice> invoices, int graceDays, bool firstMonthOfTerm, Outbox outbox)
{
    if (firstMonthOfTerm)
        graceDays = 3; // a shorter grace period in the first month of term

    List<Invoice> due = invoices.Where(i => !i.Paid && i.DaysLate > graceDays).ToList();
    var reminders = due.Select(i => outbox.Queue(i.Student, LateFee(i)));

    Console.WriteLine($"[log] {due.Count} reminders to send");

    foreach (var r in reminders)
        Console.WriteLine($"[sms] #{r.Id} to the parents of {r.Student}: late fee {r.Fee} VND");

    Console.WriteLine($"[log] late fees total {reminders.Sum(r => r.Fee)} VND");
}

// LateFee is 2% of the invoice amount.
static long LateFee(Invoice invoice) => invoice.Amount / 50;

// ---------------------------------------------------------------- test runner (do not change)
string[] lines = Console.In.ReadToEnd().Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
int grace = int.Parse(lines[0].Split(' ')[1]);
bool firstMonth = lines[1].Split(' ')[1] == "yes";
var invoiceList = new List<Invoice>();
foreach (string line in lines.Skip(2))
{
    string[] f = line.Split(' ');
    invoiceList.Add(new Invoice(f[0], long.Parse(f[1]), int.Parse(f[2]), f[3] == "paid"));
}

var box = new Outbox();
RunReminderJob(invoiceList, grace, firstMonth, box);
Console.WriteLine($"[db] outbox: {box.Rows.Count} rows");
foreach (Reminder row in box.Rows)
    Console.WriteLine($"#{row.Id} {row.Student} {row.Fee}");

// ---------------------------------------------------------------- types
record Invoice(string Student, long Amount, int DaysLate, bool Paid);
record Reminder(int Id, string Student, long Fee);

class Outbox
{
    private int _nextId = 501;
    public List<Reminder> Rows { get; } = [];

    // Queue inserts one reminder row and returns it (in the real job: an INSERT into the outbox table).
    public Reminder Queue(string student, long fee)
    {
        var r = new Reminder(_nextId++, student, fee);
        Rows.Add(r);
        return r;
    }
}
