-- Applied to production on 2026-10-27. Apply once to an existing RSVP database.
ALTER TABLE rsvps ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE rsvps ADD COLUMN last_name TEXT NOT NULL DEFAULT '';
ALTER TABLE rsvps ADD COLUMN cell_number TEXT NOT NULL DEFAULT '';
ALTER TABLE rsvps ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE rsvps ADD COLUMN guests_json TEXT NOT NULL DEFAULT '';
