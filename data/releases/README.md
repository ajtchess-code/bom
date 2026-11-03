# BOM automated release manifests

Every BOM update that should appear in the dashboard changelog and Discord release feed adds one JSON file to this directory.

Required shape:

```json
{
  "version": "v3.2.0",
  "title": "Feedback Center",
  "summary": "Short release summary.",
  "releasedAt": "2026-10-16T17:30:00Z",
  "sections": [
    {"title": "Feature", "items": ["Change one", "Change two"]}
  ]
}
```

The API and controller upsert manifests by `(guild_id, version)`. The controller posts every manifest whose release row has no Discord message ID to the configured changelog channel, then stores the posted message ID. Restarts do not repost an already-delivered release.

Configure delivery with `/feedback-admin setup` or by updating `feedback_settings`. `CHANGELOG_CHANNEL_ID` can be used as an environment fallback.
