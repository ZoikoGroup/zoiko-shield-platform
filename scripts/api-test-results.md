| Method | Path | Case | Expected | Actual | Pass/Fail |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | success (public) | `200/201` | `200` | **PASS** |
| `POST` | `/api/v1/auth/login` | success (public) | `200/201` | `201` | **PASS** |
| `POST` | `/api/v1/auth/login` | invalid input | `400/422` | `400` | **PASS** |
| `GET` | `/api/v1/alerts` | success (authenticated) | `200/201` | `200` | **PASS** |
| `GET` | `/api/v1/alerts` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/alerts` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/notifications` | success (authenticated) | `200/201` | `200` | **PASS** |
| `GET` | `/api/v1/notifications` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/notifications` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/findings` | success (authenticated) | `200/201` | `200` | **PASS** |
| `GET` | `/api/v1/findings` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/findings` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/findings/summary` | success (authenticated) | `200/201` | `200` | **PASS** |
| `GET` | `/api/v1/findings/summary` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/findings/summary` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/findings/non-existent-uuid-9999` | success (authenticated) | `200 or 404` | `404` | **PASS** |
| `GET` | `/api/v1/findings/non-existent-uuid-9999` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/findings/non-existent-uuid-9999` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/findings/non-existent-uuid-9999` | missing resource | `404` | `404` | **PASS** |
| `GET` | `/api/v1/cases` | success (authenticated) | `200/201` | `200` | **PASS** |
| `GET` | `/api/v1/cases` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/cases` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/cases/case-non-existent-9999` | success (authenticated) | `200 or 404` | `404` | **PASS** |
| `GET` | `/api/v1/cases/case-non-existent-9999` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/cases/case-non-existent-9999` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/cases/case-non-existent-9999` | missing resource | `404` | `404` | **PASS** |
| `GET` | `/api/v1/connectors` | success (authenticated) | `200/201` | `200` | **PASS** |
| `GET` | `/api/v1/connectors` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/connectors` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/context/assets` | success (authenticated) | `200/201` | `200` | **PASS** |
| `GET` | `/api/v1/context/assets` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/context/assets` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/commercial/plans` | success (public) | `200/201` | `200` | **PASS** |
| `POST` | `/api/v1/commercial/plans/recommend` | success (public) | `200/201` | `201` | **PASS** |
| `POST` | `/api/v1/commercial/plans/recommend` | invalid input | `400/422` | `400` | **PASS** |
| `GET` | `/api/v1/ai/incidents` | success (authenticated) | `200/201` | `200` | **PASS** |
| `GET` | `/api/v1/ai/incidents` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/ai/incidents` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/observability/readiness` | platform scope guard | `403` | `403` | **PASS** |
| `GET` | `/api/v1/observability/readiness` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/evidence/cross-region/status` | success (authenticated) | `200/201` | `200` | **PASS** |
| `GET` | `/api/v1/evidence/cross-region/status` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/evidence/cross-region/status` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/policies` | wrong role (403) | `403` | `403` | **PASS** |
| `GET` | `/api/v1/policies` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/policies` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/api/v1/jit/sessions` | wrong role (403) | `403` | `403` | **PASS** |
| `GET` | `/api/v1/jit/sessions` | no token | `401/403` | `401` | **PASS** |
| `GET` | `/api/v1/jit/sessions` | wrong tenant | `403` | `403` | **PASS** |
| `GET` | `/health` | gzip compression | `gzip or 200` | `gzip` | **PASS** |
| `POST` | `/api/v1/auth/login` | rate limiter (burst) | `429 or blocked` | `429` | **PASS** |
| `GET` | `/health` | database health | `200` | `200` | **PASS** |
| `POST` | `/api/v1/auth/login` | large payload (12MB) | `413/400` | `413` | **PASS** |
