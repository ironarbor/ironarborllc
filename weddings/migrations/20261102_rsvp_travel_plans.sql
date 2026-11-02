-- Applied to production on 2026-11-02. Apply once to an existing RSVP database.
ALTER TABLE rsvps ADD COLUMN hotel_stay TEXT NOT NULL DEFAULT '';
ALTER TABLE rsvps ADD COLUMN shuttle_interest TEXT NOT NULL DEFAULT '';
