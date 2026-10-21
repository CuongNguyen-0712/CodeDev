// Harness: Fix the form auditor
// Calls auditForm(form) with the test's form data ({ controls, labels, text }) and returns its
// result unchanged: one { id, name, from, description } object per control, in document order.
async function __harness(input) {
  return auditForm(input);
}
