// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-k8s-1-1",
    title: "Deployments and Services for one API",
    slug: { _type: "slug", current: "kubernetes-deployments-services" },
    description:
        "Rice Rocket's first manifests ran the api as a bare Pod behind a Service that selected nothing, then behind one that forwarded to the wrong port. Learn the four objects behind one running API - Pod, ReplicaSet, Deployment, Service - and how labels, selectors and ports tie them together, then write the api's Deployment and Service.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api image built by CI (ghcr.io/rice-rocket/api) moves from one VPS to a managed Kubernetes cluster, namespace rice-rocket. The first attempt ran, but calls to the Service were refused, and after the provider upgraded the nodes the api was simply gone.",
    },

    content: [
        h2("Situation"),
        p("This is what was applied first. `kubectl apply` accepted both objects without a single error:"),
        code("yaml", `
apiVersion: v1
kind: Pod
metadata:
  name: api
  namespace: rice-rocket
  labels:
    app.kubernetes.io/name: api
spec:
  containers:
    - name: api
      image: ghcr.io/rice-rocket/api:1.4.0
      ports:
        - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: rice-rocket
spec:
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 80`, "k8s/api.yaml"),
        bullets([
            "`curl http://api/health` from another pod: `Connection refused`.",
            "After the selector was fixed: still `Connection refused`, now with an endpoint listed.",
            "After the provider drained the nodes for an upgrade, `kubectl get pod api` answered `NotFound`.",
        ]),

        h2("The core you need"),
        bullets([
            "**A Pod is one or more containers scheduled together on one node.** Nothing recreates a Pod you created yourself: when its node is drained or fails, it is gone.",
            "**A Deployment keeps N copies running.** It creates a ReplicaSet, which creates pods from `spec.template` until `replicas` of them exist; when one disappears it makes a new one. `spec.selector` says which pods it owns and must match `spec.template.metadata.labels`, or the API server rejects the object.",
            "**Labels are how objects find each other.** Use the recommended keys (`app.kubernetes.io/name`, `app.kubernetes.io/part-of`): `name` identifies this app, `part-of` the whole product, so selecting on `part-of` catches other teams' pods too.",
            "**A Service is a stable name and address in front of changing pods.** Its `selector` picks the ready pods whose labels match every key; they become its endpoints. Inside the cluster it answers at `<service>.<namespace>.svc.cluster.local`, or just `api` from the same namespace.",
            "**`port` and `targetPort` are different ports.** `port` is what clients call on the Service; `targetPort` is the port on the pod that receives the traffic. Name the container port (`name: http`) and use `targetPort: http`, so the Service follows the container.",
        ]),

        h2("Apply it in the project"),
        p("Replace the bare Pod with a Deployment of three replicas, and point the Service at the api's own label and named port:"),
        code("yaml", `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: rice-rocket
spec:
  replicas: 3
  selector:
    matchLabels:
      app.kubernetes.io/name: api
  template:
    metadata:
      labels:
        app.kubernetes.io/name: api
        app.kubernetes.io/part-of: rice-rocket
    spec:
      containers:
        - name: api
          image: ghcr.io/rice-rocket/api:1.4.0
          ports:
            - name: http
              containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: rice-rocket
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: api
  ports:
    - name: http
      port: 80
      targetPort: http`, "k8s/api.yaml"),
        callout("info", "Why the selector never changes",
            "A Deployment's `spec.selector` is immutable after creation. Pick the label once (`app.kubernetes.io/name`), and add new labels to the template freely: the selector only needs a subset of them."),

        h2("Verify"),
        code("bash", `
kubectl apply -f k8s/api.yaml
kubectl -n rice-rocket rollout status deployment/api
# deployment "api" successfully rolled out
kubectl -n rice-rocket get pods -l app.kubernetes.io/name=api
# NAME                   READY   STATUS    RESTARTS   AGE
# api-6c9d7b8f4b-4qk2m   1/1     Running   0          40s
# api-6c9d7b8f4b-9hx7p   1/1     Running   0          40s
# api-6c9d7b8f4b-tz5dw   1/1     Running   0          40s
kubectl -n rice-rocket get endpointslices -l kubernetes.io/service-name=api
# NAME        ADDRESSTYPE   PORTS   ENDPOINTS                         AGE
# api-x7c2m   IPv4          3000    10.8.1.14,10.8.2.9,10.8.0.22      41s
kubectl -n rice-rocket run curl --rm -it --image=curlimages/curl -- curl -sS http://api/health
# {"status":"ok"}
kubectl -n rice-rocket delete pod -l app.kubernetes.io/name=api --wait=false
kubectl -n rice-rocket get pods -l app.kubernetes.io/name=api   # three new pods, new names`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A Service that selects too much.** Selecting on `app.kubernetes.io/part-of: rice-rocket` also adds the `web` and `courier-matcher` pods, so some api calls land on the wrong app. Detect it with `kubectl get endpointslices` (more addresses than api pods); select on `app.kubernetes.io/name`.",
            "**`targetPort` left at the default.** Without `targetPort`, it equals `port` (80) and the endpoints point at a port nothing listens on: endpoints exist, calls are refused. Check the PORTS column of the EndpointSlice.",
            "**Debugging with `kubectl run` and forgetting it.** A pod started by hand is not part of any Deployment: it survives no drain and shows up in `part-of` selectors. Use `--rm -it` for one-off pods and delete leftovers.",
        ]),

        challenge("chal_quiz_k8s_111"),
        p("Now write the manifests. The editor starts from the api's Deployment and Service with their key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first attempt's mistakes on purpose. Run applies the file to a simulated namespace that also runs other Rice Rocket pods, lists the Service's endpoints and calls the api through it."),
        challenge("chal_coding_k8s_112"),
    ],
});
