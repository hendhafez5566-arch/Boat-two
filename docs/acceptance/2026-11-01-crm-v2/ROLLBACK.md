# Safe rollback — existing preview only

Project a2751c62-5a61-4eb7-b3ca-0b98863e3069; environment e3e456fd-2c13-457d-91db-6aa80755f502.

- Web service ca9b7608-9010-4940-9a83-ceb430798542: successful deployment a225d92c-5498-49b2-84bf-daf2e6f51e1e. Deployment metadata reported6933bc3f1e3746c4bbc286a37847234e59e27f0c; configured pinned source stillda36947b8e51529c2b71fb783a9082e1b7d9838b. Prefer redeploying the saved successful deployment artifact for an exact rollback.
- API service cc08c76e-f631-4ce5-b3e3-92f8038dba53: successful deployment93ee271c-1c38-418b-bb9d-d94f934c4835; SHA803cc2945b3531e4ecd0fdec31b1b35d688565d6.

Release API first (its existing predeploy runs migrations), then Web. Check health between deployments. Manually pin the tested source; do not enable Auto Deploy. No new resources.

Migrations100/101 are additive: task priority has normal default; stage changes append to existing tenant-isolated audit log. Old applications remain compatible. Roll back applications only; do not drop the new column, audit events, or reset migration history. No data deletion, WABA/webhook/token change or bot activation is needed. If API health or migration fails, keep oldWeb and restore savedAPI deployment.
