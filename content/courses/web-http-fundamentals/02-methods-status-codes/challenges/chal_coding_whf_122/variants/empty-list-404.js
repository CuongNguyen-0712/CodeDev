// Wrong variant: treats "nothing found" on a list as a missing resource, so an empty list is 404.
function chooseResponse({ action, targetExists = true, inputValid = true, conflict = false }) {
  const methods = { list: "GET", read: "GET", create: "POST", replace: "PUT", update: "PATCH", delete: "DELETE" };
  if (!Object.hasOwn(methods, action)) throw new Error("Unknown action");
  const method = methods[action];
  const hasBody = ["create", "replace", "update"].includes(action);
  if (action !== "create" && targetExists === false) return { method, status: 404 };
  if (hasBody && inputValid === false) return { method, status: 422 };
  if (hasBody && conflict === true) return { method, status: 409 };
  return { method, status: action === "create" ? 201 : action === "delete" ? 204 : 200 };
}
