// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-k8s-3-1",
    title: "Gateway API: TLS and path routing",
    slug: { _type: "slug", current: "kubernetes-gateway-api-tls-path-routing" },
    description:
        "Rice Rocket's cluster still routed through the community ingress-nginx controller, which has been retired, and one of its annotations had quietly sent a marketing page to the api. Learn the Gateway API roles - GatewayClass, Gateway, HTTPRoute - listeners with TLS, how routes attach, how a path match is chosen and how redirects and rewrites work, then write the routes for ricerocket.vn.",
    estimatedTime: 16,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api and the web app run as Services `api` and `web` (port 80 each) in the namespace `rice-rocket`. Outside traffic came in through an Ingress served by the community ingress-nginx controller. That controller has been retired, so the team moves to the Gateway API the managed cluster supports, and fixes the routing surprises of the old setup on the way.",
    },

    content: [
        h2("Situation"),
        p("This is the Ingress the cluster ran until now. The controller behind it, the community ingress-nginx project, was retired by Kubernetes SIG Network: the retirement was announced in November 2025 and best-effort maintenance ended in March 2026, so it gets no more security fixes."),
        code("yaml", `
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: site
  annotations:
    nginx.ingress.kubernetes.io/use-regex: "true"
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  ingressClassName: nginx
  tls:
    - hosts: [ricerocket.vn, api.ricerocket.vn]
      secretName: ricerocket-tls
  rules:
    - host: ricerocket.vn
      http:
        paths:
          - path: /api(/|$)(.*)
            pathType: ImplementationSpecific
            backend: { service: { name: api, port: { number: 80 } } }
          - path: /
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }`, "k8s/ingress.yaml"),
        bullets([
            "Half of the behaviour lives in controller-specific annotations: the regex, the rewrite and the HTTP to HTTPS redirect all change meaning with another controller.",
            "An earlier version of the regex (`/api(.*)`) sent `https://ricerocket.vn/apiary-docs`, a marketing page, to the api, which answered 404.",
            "The platform team and the app team edit the same object: a typo in an app's path once broke the TLS block for every host.",
        ]),

        h2("The core you need"),
        bullets([
            "**Three objects, three owners.** A **GatewayClass** names an implementation; the managed cluster provides one (here `managed`). A **Gateway** is one entry point with its listeners, owned by whoever runs the cluster. An **HTTPRoute** is owned by the app team and says where requests go. All of them are `gateway.networking.k8s.io/v1`.",
            "**Listeners.** Each listener has a `name`, a `protocol` (`HTTP` or `HTTPS`), a `port` and optionally a `hostname`. An HTTPS listener terminates TLS (`tls.mode: Terminate`, the default) with the certificate in `tls.certificateRefs`, a `kubernetes.io/tls` Secret that cert-manager can keep renewed. `allowedRoutes.namespaces` (`Same` by default) says which namespaces may attach routes.",
            "**How a route attaches.** `parentRefs` names the Gateway and, with `sectionName`, one listener. The route is accepted only when that listener allows its namespace and its `hostnames` overlap the listener's hostname. `kubectl get httproute` shows the result in `status.parents[].conditions` (`Accepted`, `ResolvedRefs`).",
            "**Path matches work on segments.** `PathPrefix /api` matches `/api`, `/api/` and `/api/orders`, never `/apiary-docs`. `Exact /api` matches only `/api`. A rule without `matches` matches every path. When several rules match, the most specific wins: `Exact` before `PathPrefix`, then the longest path.",
            "**Filters.** `RequestRedirect` answers with a redirect (`scheme: https`, `statusCode: 301`). `URLRewrite` with `ReplacePrefixMatch` swaps the matched prefix, so `/api/orders` reaches the backend as `/orders`.",
            "**`backendRefs` names a Service port.** `port: 80` is the Service's port; the Service forwards to its `targetPort`. A reference to a Service or port that does not exist makes the route answer 500 for that rule.",
        ]),

        h2("Apply it in the project"),
        p("One file, `k8s/routes.yaml`, in the repository. The Gateway has an HTTPS listener with the site certificate and an HTTP listener that only redirects; `site` serves ricerocket.vn and its `/api` calls; `api` serves the partner host:"),
        code("yaml", `
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: public
  namespace: rice-rocket
spec:
  gatewayClassName: managed
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: ricerocket-tls
    - name: http
      protocol: HTTP
      port: 80
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: redirect-to-https
  namespace: rice-rocket
spec:
  parentRefs:
    - name: public
      sectionName: http
  hostnames: ["ricerocket.vn", "api.ricerocket.vn"]
  rules:
    - filters:
        - type: RequestRedirect
          requestRedirect:
            scheme: https
            statusCode: 301
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: site
  namespace: rice-rocket
spec:
  parentRefs:
    - name: public
      sectionName: https
  hostnames: ["ricerocket.vn"]
  rules:
    - matches:
        - path: { type: PathPrefix, value: /api }
      filters:
        - type: URLRewrite
          urlRewrite:
            path: { type: ReplacePrefixMatch, replacePrefixMatch: / }
      backendRefs:
        - name: api
          port: 80
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - name: web
          port: 80
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api
  namespace: rice-rocket
spec:
  parentRefs:
    - name: public
      sectionName: https
  hostnames: ["api.ricerocket.vn"]
  rules:
    - backendRefs:
        - name: api
          port: 80`, "k8s/routes.yaml"),
        callout("info", "Keep the old Ingress until the switch",
            "The new Gateway gets its own address. Apply it next to the Ingress, test it with `curl --resolve`, then move the DNS records; delete the Ingress only after the old address has stopped receiving traffic."),

        h2("Verify"),
        code("bash", `
kubectl apply -f k8s/routes.yaml
kubectl -n rice-rocket get gateway public
# NAME     CLASS     ADDRESS        PROGRAMMED   AGE
# public   managed   203.0.113.20   True         40s
kubectl -n rice-rocket get httproute
# NAME                HOSTNAMES                               AGE
# api                 ["api.ricerocket.vn"]                   40s
# redirect-to-https   ["ricerocket.vn","api.ricerocket.vn"]   40s
# site                ["ricerocket.vn"]                       40s
kubectl -n rice-rocket get httproute site -o jsonpath='{.status.parents[0].conditions[*].reason}'
# Accepted ResolvedRefs
IP=203.0.113.20
curl -sI --resolve ricerocket.vn:80:$IP http://ricerocket.vn/menu | head -2
# HTTP/1.1 301 Moved Permanently
# location: https://ricerocket.vn/menu
curl -s --resolve ricerocket.vn:443:$IP https://ricerocket.vn/api/health   # {"status":"ok"} from the api
curl -s -o /dev/null -w '%{http_code}\\n' --resolve ricerocket.vn:443:$IP https://ricerocket.vn/apiary-docs   # 200 from web`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`Exact` where a prefix was meant.** `type: Exact, value: /api` matches `/api` and nothing below it, so `/api/orders` falls through to the web app and returns its 404 page with status 200. Check the backend in the access log, not just the status code.",
            "**The container port in `backendRefs`.** `port: 3000` names a Service port that does not exist: `ResolvedRefs` turns `False` with `BackendNotFound` and the rule answers 500. Use the Service port (80).",
            "**A route that never attaches.** A `sectionName` that names no listener, `hostnames` outside the listener's hostname, or a namespace the listener does not allow all leave the route unattached, and requests get 404 or the wrong route. Read `status.parents[].conditions` after every apply.",
        ]),

        challenge("chal_quiz_k8s_171"),
        p("Now write the routes. The editor holds `k8s/routes.yaml` with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces carry the mistakes above on purpose. Run sends HTTPS and plain HTTP requests through a simulator of the Gateway and shows the status, the backend and the path each one reaches."),
        challenge("chal_coding_k8s_172"),
    ],
});
