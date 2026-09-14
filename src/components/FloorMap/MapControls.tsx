import { useMapStore } from '@/store/mapStore';

/** Кнопки масштаба: +, −, вписать, сброс. */
export function MapControls() {
  const viewBox = useMapStore((s) => s.viewBox);
  const setViewBox = useMapStore((s) => s.setViewBox);
  const fitToScreen = useMapStore((s) => s.fitToScreen);
  const resetView = useMapStore((s) => s.resetView);

  const zoomBy = (f: number) => {
    const cx = viewBox.x + viewBox.width / 2;
    const cy = viewBox.y + viewBox.height / 2;
    const w = viewBox.width * f;
    const h = viewBox.height * f;
    setViewBox({ x: cx - w / 2, y: cy - h / 2, width: w, height: h });
  };

  return (
    <div className="map-controls">
      <button type="button" title="Приблизить" onClick={() => zoomBy(0.8)}>+</button>
      <button type="button" title="Отдалить" onClick={() => zoomBy(1.25)}>−</button>
      <button type="button" title="Вписать карту в экран" onClick={fitToScreen}>⤢</button>
      <button type="button" title="Сбросить масштаб" onClick={resetView}>1:1</button>
    </div>
  );
}
