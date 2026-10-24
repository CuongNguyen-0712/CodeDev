// Wrong variant: answers 400 for a well-formed body that fails validation (the API's convention is 422).
function chooseResponse({ action, targetExists = true, inputValid = true, conflict = false }) {
  const methods = { list: "GET", read: "GET", create: "POST", replace: "PUT", update: "PATCH", delete: "DELETE" };
  if (!Object.hasOwn(methods, action)) throw new Error("Unknown action");
  const method = methods[action];
  const hasBody = ["create", "replace", "update"].includes(action);
  if (["read", "replace", "update", "delete"].includes(action) && targetExists === false) return { method, status: 404 };
  if (hasBody && inputValid === false) return { method, status: 400 };
  if (hasBody && conflict === true) return { method, status: 409 };
  return { method, status: action === "create" ? 201 : action === "delete" ? 204 : 200 };
}
