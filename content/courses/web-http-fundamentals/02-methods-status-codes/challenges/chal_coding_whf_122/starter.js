/**
 * Choose the HTTP method and status code for an operation on the CodeDev API.
 *
 * operation = {
 *   action:       "list" | "read" | "create" | "replace" | "update" | "delete"   (required, lowercase)
 *   targetExists: boolean, default true  - does the item with that id exist?
 *                 used only by read, replace, update and delete
 *   inputValid:   boolean, default true  - does the request body pass validation?
 *                 used only by create, replace and update
 *   conflict:     boolean, default false - does the change clash with existing data
 *                 (for example a duplicate enrollment)? used only by create, replace and update
 * }
 * Flags that an action does not use are ignored.
 *
 * Returns { method, status }:
 *   method  list/read -> "GET", create -> "POST", replace -> "PUT", update -> "PATCH", delete -> "DELETE"
 *   status  the first matching rule wins:
 *     1. targetExists is false  -> 404   (the API assigns ids, so PUT never creates)
 *     2. inputValid is false    -> 422
 *     3. conflict is true       -> 409
 *     4. success: list 200 (an empty list is still 200), read 200, create 201,
 *        replace 200, update 200, delete 204
 *
 * Any other action (missing, misspelled, uppercase, "GET", ...) -> throw an Error.
 *
 * @param {{ action: string, targetExists?: boolean, inputValid?: boolean, conflict?: boolean }} operation
 * @returns {{ method: string, status: number }}
 */
function chooseResponse(operation) {
  // TODO: look up the method for the action (reject unknown actions),
  // then apply the status rules in order.
  return { method: "GET", status: 200 };
}
