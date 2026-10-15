# Stored procedures

The database currently has no stored procedures (`CREATE PROCEDURE`); all server-side
logic lives in functions (`../functions`). `node db/tools/export-schema.mjs` writes one
`<schema>.<name>.sql` file here for every procedure once any exist.
