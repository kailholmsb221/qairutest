import { useMapStore } from '@/store/mapStore';

export function FloorSelector() {
  const floors = useMapStore((s) => s.floors);
  const active = useMapStore((s) => s.activeFloorId);
  const setActiveFloor = useMapStore((s) => s.setActiveFloor);
  const fit = useMapStore((s) => s.fitToScreen);
  return (
    <div className="floor-selector" role="tablist" aria-label="Этажи">
      {floors.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          aria-selected={f.id === active}
          className={f.id === active ? 'is-active' : ''}
          onClick={() => {
            setActiveFloor(f.id);
            fit();
          }}
        >
          {f.level}
        </button>
      ))}
    </div>
  );
}
