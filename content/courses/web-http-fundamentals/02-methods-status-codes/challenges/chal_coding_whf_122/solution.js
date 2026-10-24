/**
 * Reference solution (never shipped to learners).
 */
function chooseResponse({ action, targetExists = true, inputValid = true, conflict = false }) {
  if (!Object.hasOwn(ROUTES, action)) throw new Error(`Unknown action: ${JSON.stringify(action)}`);
  const { method, success, byId, hasBody } = ROUTES[action];
  if (byId && targetExists === false) return { method, status: 404 };
  if (hasBody && inputValid === false) return { method, status: 422 };
  if (hasBody && conflict === true) return { method, status: 409 };
  return { method, status: success };
}

const ROUTES = {
  list:    { method: "GET",    success: 200, byId: false, hasBody: false },
  read:    { method: "GET",    success: 200, byId: true,  hasBody: false },
  create:  { method: "POST",   success: 201, byId: false, hasBody: true },
  replace: { method: "PUT",    success: 200, byId: true,  hasBody: true },
  update:  { method: "PATCH",  success: 200, byId: true,  hasBody: true },
  delete:  { method: "DELETE", success: 204, byId: true,  hasBody: false },
};
