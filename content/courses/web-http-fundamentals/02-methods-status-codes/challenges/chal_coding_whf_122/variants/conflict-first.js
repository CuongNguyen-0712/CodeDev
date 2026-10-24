// Wrong variant: checks the conflict before validation, and lets every action use every flag,
// so an invalid duplicate is 409 and a DELETE with conflict: true is 409 too.
function chooseResponse({ action, targetExists = true, inputValid = true, conflict = false }) {
  const methods = { list: "GET", read: "GET", create: "POST", replace: "PUT", update: "PATCH", delete: "DELETE" };
  if (!(action in methods)) throw new Error("Unknown action");
  const method = methods[action];
  if (action !== "list" && action !== "create" && targetExists === false) return { method, status: 404 };
  if (conflict) return { method, status: 409 };
  if (!inputValid) return { method, status: 422 };
  return { method, status: action === "create" ? 201 : action === "delete" ? 204 : 200 };
}
