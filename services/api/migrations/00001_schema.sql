-- +goose Up
create extension if not exists pgcrypto;

create table buildings (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  timezone    text not null default 'Asia/Almaty'
);

create table floors (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  number      int  not null,
  plan_key    text not null,
  name        text not null default '',
  unique (building_id, number)
);

create type room_type as enum ('lecture','seminar','lab','coworking','admin','service','void');
create type wing      as enum ('west','east','core');

create table rooms (
  id          uuid primary key default gen_random_uuid(),
  floor_id    uuid not null references floors(id) on delete cascade,
  map_id      text not null,                       -- id из vector-map.json (стабильная связь с геометрией)
  code        text unique not null,
  name        text not null,
  map_label   text not null default '',
  type        room_type not null default 'seminar',
  map_type    text not null default '',
  wing        wing not null,
  schedulable boolean not null default true,
  capacity    int,
  area        numeric(10,2),
  geometry    jsonb not null,                       -- {"path":"M…Z","label":{"x":..,"y":..},"bbox":{"x":..,"y":..,"w":..,"h":..}}
  unique (floor_id, map_id)
);
create index rooms_floor_idx on rooms (floor_id);

create table teachers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  short_name text not null,
  department text,
  avatar_url text
);

create table student_groups (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  program     text,
  course_year smallint
);

create table courses (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  title      text not null,
  department text
);

create table semesters (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  starts_on     date not null,
  ends_on       date not null,
  week1_parity  text not null default 'odd' check (week1_parity in ('odd','even'))
);

create table time_slots (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  idx         smallint not null,
  starts_at   time not null,
  ends_at     time not null,
  unique (building_id, idx)
);

create type lesson_type  as enum ('lecture','practice','lab');
create type week_parity  as enum ('all','odd','even');

create table lessons (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references semesters(id),
  course_id   uuid not null references courses(id),
  teacher_id  uuid not null references teachers(id),
  room_id     uuid not null references rooms(id),
  slot_id     uuid not null references time_slots(id),
  weekday     smallint not null check (weekday between 1 and 7),
  parity      week_parity not null default 'all',
  type        lesson_type not null default 'practice'
);
create index lessons_semester_weekday_idx on lessons (semester_id, weekday);

create table lesson_groups (
  lesson_id uuid references lessons(id) on delete cascade,
  group_id  uuid references student_groups(id) on delete cascade,
  primary key (lesson_id, group_id)
);

create type override_kind as enum ('cancel','move','delay','reassign_teacher','extra');

create table session_overrides (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      uuid references lessons(id) on delete cascade,
  date           date not null,
  kind           override_kind not null,
  new_room_id    uuid references rooms(id),
  new_teacher_id uuid references teachers(id),
  delay_minutes  int,
  -- extra:
  course_id      uuid references courses(id),
  slot_id        uuid references time_slots(id),
  room_id        uuid references rooms(id),
  teacher_id     uuid references teachers(id),
  group_ids      uuid[] not null default '{}',
  note           text,
  created_at     timestamptz not null default now()
);
create index session_overrides_date_idx on session_overrides (date);

create table announcements (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  text        text not null,
  severity    text not null default 'info' check (severity in ('info','warning','alert')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null
);
create index announcements_window_idx on announcements (building_id, starts_at, ends_at);

-- +goose Down
drop table if exists announcements;
drop table if exists session_overrides;
drop type if exists override_kind;
drop table if exists lesson_groups;
drop table if exists lessons;
drop type if exists week_parity;
drop type if exists lesson_type;
drop table if exists time_slots;
drop table if exists semesters;
drop table if exists courses;
drop table if exists student_groups;
drop table if exists teachers;
drop table if exists rooms;
drop type if exists wing;
drop type if exists room_type;
drop table if exists floors;
drop table if exists buildings;
