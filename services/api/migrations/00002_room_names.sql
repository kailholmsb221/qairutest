-- +goose Up
-- Room names per UI locale (the owner's room programme, room-codes.json → building-a.json → seed).
-- Search matches code + all three names, so a query works in whichever language the screen is in.
alter table rooms
  add column name_kk text not null default '',
  add column name_en text not null default '';

-- +goose Down
alter table rooms drop column name_kk, drop column name_en;
