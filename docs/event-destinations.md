# Event destinations

Event destinations send server activity to an external webhook receiver. Manage them in **Settings → System**. Each destination has a name, HTTP(S) URL, secret, and the event types it should receive. The secret is never returned after saving; editing shows only that one is set, and leaving the field blank keeps the existing value.

## Events

| Event | Payload highlights |
| --- | --- |
| `run.finished` | Run id/status/source plus bot id/name and token totals — no transcript text |
| `bot.blocked` | Bot identity and blocking status |
| `bot.recovered` | Bot identity after a blocked status clears |
| `notification.created` | Notification kind and title only |
| `breaker.tripped` | Global spend-circuit event; delivered even while the server is paused |

Payloads contain no secret values.

## Delivery behavior

Every delivery is a fire-and-forget JSON `POST`:

```json
{
  "id": "0f6c…",
  "type": "run.finished",
  "occurred_at": 1730000000000,
  "data": {}
}
```

The raw body is signed with the destination secret:

```http
X-Bots-Signature: sha256=<hex hmac of the request body>
```

Requests time out after 10 seconds and never block a run, trigger fire, or notification. Connection errors, timeouts, `429`, and `5xx` responses are retried up to three times with exponential backoff; other non-success responses stop immediately. Every attempt records its event type, HTTP status, duration, outcome, and error for review through the deliveries API.

Disabled destinations receive nothing and retain their existing logs. While global pause is active, no new events fire except `breaker.tripped`. **Send test** sends a manual `ping` event to an enabled destination and reports its HTTP status and latency inline; it works without waiting for a matching application event. Creating or editing a destination takes effect immediately.

Routes for destinations, delivery logs and the test endpoint — including the `409` a disabled destination answers on `/test` — are in the [API reference](/api#event-destinations). See also [Notifications](/notifications) and [Triggers & scheduling](/triggers-scheduling).
