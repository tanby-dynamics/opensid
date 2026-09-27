# Dashboard tiles reference Saved Views live, not by snapshot

Dashboard tiles can be filtered by selecting an existing Saved View (`saved_view_id` on `dashboard_config`). We store a reference to the Saved View, not a copy of its filter criteria at selection time. Editing a Saved View's filters therefore immediately changes the behaviour of every tile that references it, and deleting a Saved View causes referencing tiles to silently fall back to unfiltered rather than erroring.

We chose this over snapshotting because "saved" views are meant to be a single source of truth you edit once and have apply everywhere they're used — snapshotting would let a tile's filter silently drift from the view it claims to use, which is worse than the action-at-a-distance tradeoff of live references.
