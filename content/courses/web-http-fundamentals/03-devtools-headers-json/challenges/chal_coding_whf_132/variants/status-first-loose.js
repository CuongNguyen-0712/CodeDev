// Wrong variant: looks at the status before the networkError and compares loosely,
// so { networkError: "aborted", status: 200 } is "success" and the string "404" is "not_found".
function classifyResponse(result) {
  if (!result) return "network";
  const status = result.status;
  if (status >= 200 && status < 300) return "success";
  if (status == 400 || status == 422) return "validation";
  if (status == 401 || status == 403) return "auth";
  if (status == 404) return "not_found";
  if (status >= 500 && status < 600) return "server";
  if (result.networkError || !status) return "network";
  return "unexpected";
}
