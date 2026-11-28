# Alert rules: setting your own alert conditions

A workspace administrator can define the conditions that raise an alert, without
a deployment. Open **Customer panel → Detection & Response → My alert rules**.

## What a rule is

> When a newly received event matches **all** of these conditions, raise an alert
> of this severity.

A condition is *field* + *operator* + *value*:

| Field examples | Operators |
| --- | --- |
| Activity (`GIT_PUSH`), Resource (the repository), Actor, Actor email, Outcome, Event class, Source IP … | is · is not · contains · is one of (comma separated) |

Matching ignores upper/lower case. Up to 10 conditions per rule, all of which
must hold.

**Only alert when it happens several times** (optional): "alert after 5 matching
events within 10 minutes". When it fires, the rule stays quiet for the rest of
that window, so a burst raises one alert, not one per event.

## Try before you save

**Test against recent events** shows how many of your last events the rule
*would have* matched, with a few examples. It records nothing and raises no
alert. Use it to catch a rule that matches nothing (a typo) or everything (too
broad).

## Example

Alert whenever someone pushes to the payments repository:

- Activity **is** `GIT_PUSH`
- Resource **is** `acme/payments`
- Severity: High

## Limits worth knowing

- Rules apply to events received **after** the rule is created or turned on.
  They do not go back over history (use the test button to see how it would have
  behaved).
- A rule fires on a match. It cannot yet express "an event did **not** happen",
  or conditions on a specific Git branch (the branch is not a field of the
  normalized event).
- Your rules are yours: they apply only to your workspace's events. Shared
  platform rules are not shown or editable here.
- At most 100 rules per workspace; the first 50 active ones (oldest first) are
  checked against each event.
- A problem evaluating a rule never loses the event. It is stored and processed
  as normal either way.
- Creating, changing, or turning rules on or off needs tenant **write** access;
  viewing and testing needs **read** access.

## API

All under `/api/v1/alert-rules` (documented in `docs/swagger.yaml`):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | List your rules |
| POST | `/` | Create |
| PATCH | `/{id}` | Edit name, severity, conditions, threshold |
| POST | `/{id}/enabled` | `{ "enabled": true \| false }` |
| POST | `/preview` | Test conditions against recent events |

The tenant always comes from the signed-in session; a tenant id in a request
body is ignored.
