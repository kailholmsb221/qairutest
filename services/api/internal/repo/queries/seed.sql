-- name: CountBuildings :one
select count(*) from buildings;

-- name: TruncateAll :exec
truncate announcements, session_overrides, lesson_groups, lessons, time_slots, semesters, courses, student_groups, teachers, rooms, floors, buildings restart identity cascade;

-- name: InsertBuilding :one
insert into buildings (code, name, timezone) values ($1, $2, $3) returning id;

-- name: InsertFloor :one
insert into floors (building_id, number, plan_key, name) values ($1, $2, $3, $4) returning id;

-- name: InsertRoom :one
insert into rooms (floor_id, map_id, code, name, map_label, type, map_type, wing, schedulable, capacity, area, geometry)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id;

-- name: InsertTeacher :one
insert into teachers (full_name, short_name, department) values ($1, $2, $3) returning id;

-- name: InsertGroup :one
insert into student_groups (code, program, course_year) values ($1, $2, $3) returning id;

-- name: InsertCourse :one
insert into courses (code, title, department) values ($1, $2, $3) returning id;

-- name: InsertSemester :one
insert into semesters (name, starts_on, ends_on, week1_parity) values ($1, $2, $3, $4) returning id;

-- name: InsertTimeSlot :one
insert into time_slots (building_id, idx, starts_at, ends_at) values ($1, $2, $3, $4) returning id;

-- name: InsertLesson :one
insert into lessons (semester_id, course_id, teacher_id, room_id, slot_id, weekday, parity, type)
values ($1, $2, $3, $4, $5, $6, $7, $8) returning id;

-- name: InsertLessonGroup :exec
insert into lesson_groups (lesson_id, group_id) values ($1, $2) on conflict do nothing;
