import type { RoomStatus } from '@/types/plan';
import { STATUS_COLORS, STATUS_LABELS, TYPE_COLORS } from '@/styles/theme';
import { useMapStore } from '@/store/mapStore';

const ORDER: RoomStatus[] = ['busy', 'ending', 'soon', 'free', 'service'];

/** Легенда цветов; клик по строке включает фильтр по статусу. */
export function Legend() {
  const filter = useMapStore((s) => s.statusFilter);
  const toggle = useMapStore((s) => s.toggleStatusFilter);
  const clear = useMapStore((s) => s.clearStatusFilter);
  return (
    <div className="legend">
      {ORDER.map((st) => (
        <button
          key={st}
          type="button"
          className={['legend-row', filter.includes(st) ? 'is-active' : '', filter.length && !filter.includes(st) ? 'is-muted' : ''].filter(Boolean).join(' ')}
          onClick={() => toggle(st)}
          title="Фильтровать по статусу"
        >
          <span className="swatch" style={{ background: STATUS_COLORS[st] }} />
          <span>{STATUS_LABELS[st]}</span>
        </button>
      ))}
      <div className="legend-row legend-static">
        <span className="swatch" style={{ background: TYPE_COLORS.corridor }} />
        <span>Коридоры и холлы</span>
      </div>
      <div className="legend-row legend-static">
        <span className="swatch" style={{ background: TYPE_COLORS.wc }} />
        <span>Санузлы</span>
      </div>
      <div className="legend-row legend-static">
        <span className="swatch swatch-hatch" style={{ background: TYPE_COLORS.stairs }} />
        <span>Лестницы, лифты, техзоны</span>
      </div>
      {filter.length > 0 && (
        <button type="button" className="link" onClick={clear}>
          Сбросить фильтр
        </button>
      )}
    </div>
  );
}
