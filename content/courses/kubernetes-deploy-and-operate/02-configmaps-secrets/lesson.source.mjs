// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-k8s-1-2",
    title: "ConfigMaps, Secrets and environment",
    slug: { _type: "slug", current: "kubernetes-configmaps-secrets-environment" },
    description:
        "Rice Rocket's first manifest committed the database password to git, a ConfigMap edit never reached the running pods, and a typo in a Secret key left new pods stuck in CreateContainerConfigError. Learn how the kubelet builds a container's environment and files from ConfigMaps and Secrets, when running pods see a change, and wire the api's config and secrets properly.",
    estimatedTime: 15,

    scenario: {
        role: "Backend developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "The api now runs as a Deployment in the namespace `rice-rocket`, with Postgres as a managed database outside the cluster. Its first manifest carried every setting and every secret as plain `value:` entries, and three things went wrong within a week.",
    },

    content: [
        h2("Situation"),
        p("This is the container part of the first manifest:"),
        code("yaml", `
      containers:
        - name: api
          image: ghcr.io/rice-rocket/api:1.4.0
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              value: postgres://rocket:Rr-prod-2026!@db.internal.ricerocket.vn:5432/rocket
            - name: JWT_SECRET
              value: k3y-for-signing-tokens`, "k8s/api.yaml"),
        bullets([
            "The file is in git, so the production database password is in every clone and every CI log that prints the manifest.",
            "The team moved `NODE_ENV` and friends into a ConfigMap, edited a value with `kubectl edit configmap`, and the running pods kept the old one for two days.",
            "After the password moved into a Secret, a rollout created pods stuck in `CreateContainerConfigError` while the old pods kept serving: the manifest asked for the key `dbPassword`, the Secret has `db-password`.",
        ]),

        h2("The core you need"),
        bullets([
            "**ConfigMap for settings, Secret for secrets.** Both are maps of keys to strings in the namespace. ConfigMap `data` values must be strings: `PORT: 3000` is rejected, `PORT: \"3000\"` is not.",
            "**Into the environment.** `envFrom: [{ configMapRef: { name: api-config } }]` turns every key into a variable; `env[].valueFrom.secretKeyRef` (or `configMapKeyRef`) picks one key. A missing object or key leaves the container in `CreateContainerConfigError` unless the reference says `optional: true`.",
            "**Into files.** A `secret` (or `configMap`) volume writes each key as a file; `items` picks keys and names the files. Mounted at `/run/secrets` with `readOnly: true`, the key `jwt-secret` becomes `/run/secrets/jwt_secret`, the path the api already reads through `JWT_SECRET_FILE` (Docker & Nginx course, lesson 3).",
            "**When pods see a change.** Variables are read once, when the container starts: a ConfigMap edit reaches them only with new pods (`kubectl rollout restart deployment/api`). Mounted files are refreshed in place by the kubelet within about a minute, except when mounted with `subPath`, which never updates.",
            "**A Secret is not encrypted by default.** Its values are base64, which anyone who can read the object can decode. What protects it is RBAC on `secrets`, encryption at rest in the cluster, and keeping the values out of git: create the Secret out of band (`kubectl create secret`, or a secrets operator) and let the manifest only refer to it.",
        ]),

        h2("Apply it in the project"),
        p("Create the Secret once per cluster from files that never enter the repository:"),
        code("bash", `
kubectl -n rice-rocket create secret generic api-secrets \\
  --from-file=db-password=./db-password.txt \\
  --from-file=jwt-secret=./jwt-secret.txt
shred -u ./db-password.txt ./jwt-secret.txt`, "terminal"),
        p("The manifest keeps the settings in a ConfigMap and only refers to the Secret. The api builds its connection string from `DATABASE_HOST`, `DATABASE_USER`, `DATABASE_NAME` and `DATABASE_PASSWORD`, so no URL with a password exists anywhere:"),
        code("yaml", `
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-config
  namespace: rice-rocket
data:
  NODE_ENV: production
  PORT: "3000"
  DATABASE_HOST: db.internal.ricerocket.vn
  DATABASE_USER: rocket
  DATABASE_NAME: rocket
  JWT_SECRET_FILE: /run/secrets/jwt_secret
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: rice-rocket
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: ghcr.io/rice-rocket/api:1.4.0
          ports:
            - name: http
              containerPort: 3000
          envFrom:
            - configMapRef:
                name: api-config
          env:
            - name: DATABASE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: api-secrets
                  key: db-password
          volumeMounts:
            - name: jwt
              mountPath: /run/secrets
              readOnly: true
      volumes:
        - name: jwt
          secret:
            secretName: api-secrets
            items:
              - key: jwt-secret
                path: jwt_secret`, "k8s/api.yaml"),
        callout("info", "Rolling out a config change on purpose",
            "Some teams put a hash of the ConfigMap into a pod template annotation (`checksum/config: <sha256>`), generated by their deploy tooling: a config change then changes the template, and the Deployment rolls out new pods by itself. Without tooling, run `kubectl rollout restart deployment/api` after the edit."),

        h2("Verify"),
        code("bash", `
kubectl apply -f k8s/api.yaml
kubectl -n rice-rocket rollout status deployment/api
# deployment "api" successfully rolled out
kubectl -n rice-rocket exec deploy/api -- printenv NODE_ENV DATABASE_HOST
# production
# db.internal.ricerocket.vn
kubectl -n rice-rocket exec deploy/api -- ls -l /run/secrets
# lrwxrwxrwx 1 root root 17 Nov  5 09:12 jwt_secret -> ..data/jwt_secret
kubectl -n rice-rocket get secret api-secrets -o jsonpath='{.data}' | head -c 60
# {"db-password":"UnItcHJvZC0yMDI2IQ==", ...   base64, not encryption
git grep -n "Rr-prod" || echo "no secret in the repository"`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**A wrong key name rolls out half a deploy.** New pods sit in `CreateContainerConfigError` while the old ReplicaSet keeps serving, so nothing looks down. Detect it with `kubectl -n rice-rocket get pods` and `kubectl describe pod`, whose events say `couldn't find key dbPassword in Secret rice-rocket/api-secrets`.",
            "**Expecting variables to follow an edit.** `kubectl edit configmap api-config` changes nothing in running containers' environments. Check with `kubectl exec ... printenv`, then `kubectl rollout restart deployment/api`.",
            "**`subPath` for a single file.** It looks neater (`mountPath: /run/secrets/jwt_secret`, `subPath: jwt_secret`) but the file is copied once and never refreshed, so a rotated secret reaches only new pods. Mount the directory and pick the key with `items` instead.",
        ]),

        p("Now wire the api's config and secrets. The editor starts from the corrected file with its key blocks missing, each marked by a `# [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first manifest's mistakes on purpose. Run starts the api container in a kubelet simulator against the cluster's Secret and lists its variables and files."),
        challenge("chal_coding_k8s_122"),
    ],
});
