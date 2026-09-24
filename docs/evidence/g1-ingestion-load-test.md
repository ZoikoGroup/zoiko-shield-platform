# G1 scale envelope — ingestion load test result

**Status: THE G1 SCALE ENVELOPE IS NOT MET.**

The ERB-01 G1 slice states a scale envelope of 15,000 events/sec peak
(0.2–2 TB/day, 3–10 tenants, 2K–10K resources). Measured sustained ingestion
on the local deployment is approximately **60 events/sec**, about 250x below
that figure.

This document records what was measured, on what, and by what method, so the
gap is a known quantity rather than an assumption in either direction.

## How it was measured

`npm run loadtest:ingestion` (`backend/scripts/load-test-ingestion.ts`) drives
real HTTP webhooks against a running shield-ingest at a fixed offered rate,
with HMAC signing, keep-alive connections and a bounded socket pool. After the
load stops it polls `NormalizedEvent` until the backlog drains, so the
asynchronous half of the pipeline is included rather than assumed.

It replaces nothing: `benchmark-detection-pipeline.ts` still exists and still
measures what it always measured, which is `rule.evaluate()` called in a loop
inside one process. That harness opens no socket, serializes no event and
touches neither Kafka nor Postgres. Its numbers are not throughput and were
never comparable to the envelope.

## Environment

Single developer machine, whole stack in Docker on one host: postgres,
redpanda, minio, redis and five Node services, with the load generator running
on the same machine. This is not representative of a production deployment and
no figure here is extrapolated to one.

## Results

| Offered | Accepted | Sustained accept rate | p50 | p95 | p99 | Normalized | Drain after load |
|---|---|---|---|---|---|---|---|
| 50/s × 5s | 250/250 | 45/s | 1,578 ms | 2,295 ms | 2,597 ms | 250/250 | 6.0 s |
| 60/s × 15s | 900/900 | 56/s | 2,048 ms | 2,699 ms | 2,792 ms | 900/900 | 16.0 s |
| 200/s × 10s | 2000/2000 | 63/s | 12,219 ms | 21,388 ms | 22,612 ms | 2000/2000 | 36.1 s |

Nothing was dropped or rejected at any rate: every request eventually returned
202 and every accepted event eventually reached `NormalizedEvent`. The limit is
not correctness, it is rate.

## What the numbers say

Accept rate is flat at roughly 56–63/sec regardless of what is offered. Raising
the offered rate from 60 to 200/sec did not raise throughput at all; it raised
p50 latency from 2.0 s to 12.2 s and peak in-flight requests from 168 to 1,488.
That is a saturated service absorbing a queue, not a service under load.

A p50 of 1.6 s at only 50 events/sec is the tell. The cost is per request and
it is paid before the 202 is returned.

## Where the time goes

`RawIngestService.processWebhookPayload` does all of this synchronously in the
request path, before responding:

1. replay-nonce consumption (database)
2. `connectorInstance.findUnique` (database)
3. `rawEvent.findFirst` duplicate check (database)
4. `rawEvent.create` (database)
5. several `meteringService.recordUsageObservation` writes (database)
6. `kafkaProducer.emit` (network)

That is six or more round trips per accepted event. At single-digit
milliseconds each, tens of milliseconds per request is the expected result, and
tens of milliseconds per request is what caps a single-process service in the
tens per second.

## What would have to change

The endpoint returns 202 Accepted, which is a promise to process, not a report
that processing finished. It should be able to keep that promise after
durably recording the raw bytes and nothing else:

1. Persist the raw event and return. Move duplicate detection, metering and
   connector lookup behind the queue.
2. Batch the metering writes rather than writing per event.
3. Batch Kafka produces, and do not await each one individually.
4. Re-measure. Only after that does horizontal scaling mean anything: adding
   instances multiplies whatever one instance can do, and one instance
   currently does about 60/sec.

Until step 4 produces a number, the 15,000 events/sec envelope is an open
G1 item and must not be recorded as met.
