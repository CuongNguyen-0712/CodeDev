using System.Globalization;

// Sen Academy - monthly tuition invoices for one class.
//
// Input (stdin): one student per line, three fields separated by spaces:
//   ID        student id, e.g. HS-1024
//   FEE       the class's monthly fee in VND (a whole number, e.g. 1800000)
//   DISCOUNT  the student's discount in percent, 0 to 100, may have decimals (e.g. 12.5)
//
// Write AmountDue, Total and Average. The test runner at the bottom prints:
//   ID AMOUNT          one line per student: the fee after the discount, in whole VND
//   total T VND        the sum of all amounts
//   average A VND      T / number of students, in whole VND ("average n/a" when there are no students)
//
// Amounts in VND have no decimals: round to the nearest đồng, and round a half (x.5) UP,
// away from zero - 750002.5 becomes 750003. That is the rule the accountant uses.
//
// Example input:
//   HS-1024 1800000 12.5
//   HS-1025 1800000 50
// Expected output:
//   HS-1024 1575000
//   HS-1025 900000
//   total 2475000 VND
//   average 1237500 VND

// AmountDue returns monthlyFee minus discountPercent percent of it, rounded to whole VND.
static long AmountDue(long monthlyFee, decimal discountPercent)
{
    decimal exact = monthlyFee * (100 - discountPercent) / 100;
    return (long)Math.Round(exact);
}

// Total returns the sum of the amounts. A whole school is billions of VND.
static long Total(List<long> amounts)
{
    long sum = 0;
    foreach (long amount in amounts)
        sum += amount;
    return sum;
}

// Average returns the mean amount, rounded to whole VND like AmountDue. amounts is never empty.
static long Average(List<long> amounts)
{
    decimal exact = (decimal)Total(amounts) / amounts.Count;
    return (long)Math.Round(exact);
}

// ---------------------------------------------------------------- test runner (do not change)
var amounts = new List<long>();
foreach (string line in Console.In.ReadToEnd().Split('\n'))
{
    string[] f = line.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    if (f.Length == 0) continue;
    long amount = AmountDue(long.Parse(f[1]), decimal.Parse(f[2], CultureInfo.InvariantCulture));
    amounts.Add(amount);
    Console.WriteLine($"{f[0]} {amount}");
}
Console.WriteLine($"total {Total(amounts)} VND");
Console.WriteLine(amounts.Count == 0 ? "average n/a" : $"average {Average(amounts)} VND");
