-- name: ListBuildings :many
select b.id, b.code, b.name, b.timezone, (select count(*) from floors f where f.building_id = b.id)::int as floors
from buildings b order by b.code;

-- name: GetBuildingByCode :one
select id, code, name, timezone from buildings where code = $1;

-- name: ListFloors :many
select id, building_id, number, plan_key, name from floors where building_id = $1 order by number;

-- name: ListRoomsByBuilding :many
select r.id, r.floor_id, f.number as floor, r.map_id, r.code, r.name, r.map_label, r.type, r.map_type, r.wing,
       r.schedulable, r.capacity, r.area, r.geometry
from rooms r join floors f on f.id = r.floor_id
where f.building_id = $1
order by f.number, r.code;

-- name: GetRoomByCode :one
select r.id, r.floor_id, f.number as floor, r.map_id, r.code, r.name, r.map_label, r.type, r.map_type, r.wing,
       r.schedulable, r.capacity, r.area, r.geometry, f.building_id
from rooms r join floors f on f.id = r.floor_id
where r.code = $1;

-- name: ListTeachers :many
select id, full_name, short_name, department, avatar_url from teachers order by short_name;

-- name: GetTeacher :one
select id, full_name, short_name, department, avatar_url from teachers where id = $1;

-- name: ListGroups :many
select id, code, program, course_year from student_groups order by code;

-- name: GetGroupByCode :one
select id, code, program, course_year from student_groups where code = $1;

-- name: ListCourses :many
select id, code, title, department from courses order by code;

-- name: GetCourseByCode :one
select id, code, title, department from courses where code = $1;

-- name: ListSemesters :many
select id, name, starts_on, ends_on, week1_parity from semesters order by starts_on;

-- name: ListTimeSlots :many
select id, building_id, idx, starts_at, ends_at from time_slots where building_id = $1 order by idx;

-- name: ListLessonsBySemester :many
select l.id, l.semester_id, l.course_id, l.teacher_id, l.room_id, l.slot_id, l.weekday, l.parity, l.type,
       coalesce(array_agg(lg.group_id) filter (where lg.group_id is not null), '{}')::uuid[] as group_ids
from lessons l
left join lesson_groups lg on lg.lesson_id = l.id
where l.semester_id = $1
group by l.id
order by l.weekday, l.slot_id, l.id;

-- name: GetLesson :one
select l.id, l.semester_id, l.course_id, l.teacher_id, l.room_id, l.slot_id, l.weekday, l.parity, l.type,
       coalesce(array_agg(lg.group_id) filter (where lg.group_id is not null), '{}')::uuid[] as group_ids
from lessons l
left join lesson_groups lg on lg.lesson_id = l.id
where l.id = $1
group by l.id;

-- name: ListOverridesByDate :many
select id, lesson_id, date, kind, new_room_id, new_teacher_id, delay_minutes, course_id, slot_id, room_id, teacher_id, group_ids, note, created_at
from session_overrides where date = $1 order by created_at;

-- name: ListOverridesBetween :many
select id, lesson_id, date, kind, new_room_id, new_teacher_id, delay_minutes, course_id, slot_id, room_id, teacher_id, group_ids, note, created_at
from session_overrides where date between $1 and $2 order by date, created_at;

-- name: GetOverride :one
select id, lesson_id, date, kind, new_room_id, new_teacher_id, delay_minutes, course_id, slot_id, room_id, teacher_id, group_ids, note, created_at
from session_overrides where id = $1;

-- name: InsertOverride :one
insert into session_overrides (lesson_id, date, kind, new_room_id, new_teacher_id, delay_minutes, course_id, slot_id, room_id, teacher_id, group_ids, note)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
returning id, lesson_id, date, kind, new_room_id, new_teacher_id, delay_minutes, course_id, slot_id, room_id, teacher_id, group_ids, note, created_at;

-- name: DeleteOverride :execrows
delete from session_overrides where id = $1;

-- name: ListActiveAnnouncements :many
select id, building_id, text, severity, starts_at, ends_at
from announcements
where building_id = $1 and starts_at <= $2 and ends_at > $2
order by starts_at;

-- name: InsertAnnouncement :one
insert into announcements (building_id, text, severity, starts_at, ends_at)
values ($1, $2, $3, $4, $5)
returning id, building_id, text, severity, starts_at, ends_at;

-- name: SearchTeachers :many
select id, full_name, short_name, department from teachers
where full_name ilike '%' || sqlc.arg(q)::text || '%' or short_name ilike '%' || sqlc.arg(q)::text || '%'
order by short_name limit 5;

-- name: SearchGroups :many
select id, code, program, course_year from student_groups
where code ilike '%' || sqlc.arg(q)::text || '%' or coalesce(program, '') ilike '%' || sqlc.arg(q)::text || '%'
order by code limit 5;

-- name: SearchRooms :many
select r.id, r.code, r.name, f.number as floor, r.type from rooms r join floors f on f.id = r.floor_id
where r.code ilike '%' || sqlc.arg(q)::text || '%' or r.name ilike '%' || sqlc.arg(q)::text || '%'
   or r.name_kk ilike '%' || sqlc.arg(q)::text || '%' or r.name_en ilike '%' || sqlc.arg(q)::text || '%'
order by r.schedulable desc, r.code limit 5;

-- name: SearchCourses :many
select id, code, title, department from courses
where code ilike '%' || sqlc.arg(q)::text || '%' or title ilike '%' || sqlc.arg(q)::text || '%'
order by code limit 5;

-- name: DeleteLesson :execrows
delete from lessons where id = $1;
