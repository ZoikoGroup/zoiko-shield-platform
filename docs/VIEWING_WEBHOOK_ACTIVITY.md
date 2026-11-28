# Seeing what a webhook connector has received

Each delivery a sender posts to a connector is stored, then understood (normalized). There are four places to look, from easiest to most detailed.

## 1. In the app: Recent activity (Customer panel)
**Integrations -> select the connector -> Recent activity.**

It shows how many deliveries the connector has received in total and in the last 24 hours, when the last one arrived, and the latest ten, newest first. Each row says what happened (for example "Git push"), where (the repository), who did it, the outcome, and a short detail line (branch, number of commits, commit title). It refreshes by itself every 20 seconds while the tab is visible, and has a **Refresh** button.

Each delivery has one of three states:

| State | Meaning |
|---|---|
| **Processed** | Received, stored and understood. |
| **Received** | Stored, not processed yet. If this stays for long, the normalizer is not running (see "Kafka consumer health" in DEPLOY.md). |
| **Rejected** | Stored but set aside: it was empty or did not match this connector. |

The payload itself is never shown here, only a short summary. A delivery sent with a **wrong signature is not stored at all** and so does not appear: it is rejected before it reaches the connector (the sender sees `401`).

## 2. At the sender
For GitHub: repository **Settings -> Webhooks ->** the webhook **-> Recent Deliveries**. Open a delivery to see the exact request and our reply. Our reply contains the id of the stored event (`data.id`), so a delivery can be matched to a row. **Redeliver** sends it again.

## 3. The database
```bash
# deliveries per webhook connector, with the last one (UTC)
docker exec <postgres-container> psql -U shield -d shield_core -c "select left(i.id::text,8) as connector, i.name, count(r.id) as deliveries, max(r.received_at)::timestamp(0) as last_delivery from ingest.\"ConnectorInstance\" i left join ingest.\"RawEvent\" r on r.connector_id=i.id where i.authentication_type='WEBHOOK_SECRET' and i.\"deletedAt\" is null group by i.id,i.name order by max(r.received_at) desc nulls last"
```

## 4. Server logs
```bash
docker logs --since 30m <core-container>   2>&1 | grep "IngestionWebhookGateway"    # one line per delivery: "relayed to ingest: 202"
docker logs --since 30m <ingest-container> 2>&1 | grep -E "Received incoming webhook|Normalizing"
```
Container logs start empty each time a container is rebuilt or recreated.

## Not seeing an event you expect?
1. Is it in **Recent activity**? If not, check the sender's delivery list for the response code: `401` is a signature problem, `404` an unknown connector or a gateway that is not deployed.
2. In **Recent activity** but "Received" and not "Processed"? The normalizer is stalled: `GET /health/consumer` on shield-ingest returns 503, and `rpk group describe shield-ingest-normalization` shows lag.
3. Processed, but the asset's "Last seen" is old? shield-core's consumer is stalled: `GET /health/consumer` on shield-core.
