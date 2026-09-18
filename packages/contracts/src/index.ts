/**
 * Типы API. Единственный источник — openapi.yaml; файл types.gen.ts генерируется `pnpm contracts:gen`.
 * DTO руками не писать: экспортируем удобные алиасы на сгенерированные схемы.
 */
import type { components, operations, paths } from './types.gen';

export type { components, operations, paths };

export type Schemas = components['schemas'];
export type Snapshot = Schemas['Snapshot'];
export type SessionView = Schemas['SessionView'];
export type RoomLiveState = Schemas['RoomLiveState'];
export type SnapshotStats = Schemas['SnapshotStats'];
export type BuildingMap = Schemas['BuildingMap'];
export type MapFloor = Schemas['MapFloor'];
export type MapRoom = Schemas['MapRoom'];
export type Building = Schemas['Building'];
export type TimeInfo = Schemas['TimeInfo'];
export type DayTimeline = Schemas['DayTimeline'];
export type DaySchedule = Schemas['DaySchedule'];
export type TimeSlot = Schemas['TimeSlot'];
export type SearchResult = Schemas['SearchResult'];
export type Announcement = Schemas['Announcement'];
export type AnnouncementRequest = Schemas['AnnouncementRequest'];
export type OverrideRequest = Schemas['OverrideRequest'];
export type Override = Schemas['Override'];
export type OverrideKind = Schemas['OverrideKind'];
export type AdminCatalog = Schemas['AdminCatalog'];
export type CatalogSlot = Schemas['CatalogSlot'];
export type CatalogRoom = Schemas['CatalogRoom'];
export type Lesson = Schemas['Lesson'];
export type LessonRequest = Schemas['LessonRequest'];
export type WeekParity = Schemas['WeekParity'];
export type Phase = Schemas['Phase'];
export type RoomPhase = Schemas['RoomPhase'];
export type SessionStatus = Schemas['SessionStatus'];
export type LessonType = Schemas['LessonType'];
export type RoomType = Schemas['RoomType'];
export type Wing = Schemas['Wing'];
export type ClockMode = Schemas['ClockMode'];
export type Parity = Schemas['Parity'];
export type Severity = Schemas['Severity'];
export type Heartbeat = Schemas['Heartbeat'];
export type ApiError = Schemas['Error'];
export type TeacherRef = Schemas['TeacherRef'];
