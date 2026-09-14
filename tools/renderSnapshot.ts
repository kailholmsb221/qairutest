/**
 * Статический SVG-снимок этажа из JSON (для визуальной проверки без браузера).
 * Использование: tsx tools/renderSnapshot.ts floor-1 out.svg
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FloorPlan } from '../src/types/plan';
import { buildRoomPath, wallPath, boundaryPolyline, bbox } from '../src/geometry/buildRoomPath';
import { doorGeometry } from '../src/geometry/doorGeometry';
import { roomFill } from '../src/styles/theme';

const [floorId = 'floor-1', out = `${floorId}.svg`, editFlag = ''] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(resolve('src/data', `${floorId}.json`), 'utf8')) as FloorPlan;
const showPoints = editFlag === '--points';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const parts: string[] = [];
const vb = plan.viewBox;
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" width="${vb.width * 1.4}" height="${vb.height * 1.4}" font-family="Segoe UI, Arial, sans-serif">`);
parts.push(`<rect x="${vb.x}" y="${vb.y}" width="${vb.width}" height="${vb.height}" fill="#111c29"/>`);
parts.push(`<path d="${buildRoomPath(plan, plan.exterior)}" fill="#15233299" stroke="#4fd1ff" stroke-width="7" opacity="0.4"/>`);
for (const r of plan.rooms) parts.push(`<path d="${buildRoomPath(plan, r.boundary)}" fill="${roomFill(r)}"/>`);
for (const [, w] of Object.entries(plan.walls)) {
  parts.push(`<path d="${wallPath(plan, w)}" fill="none" stroke="${w.exterior ? '#4fd1ff' : '#7fc3e6'}" stroke-width="${w.exterior ? 2.6 : 1.3}" ${w.virtual ? 'stroke-dasharray="5 4"' : ''}/>`);
}
for (const d of plan.doors) {
  const g = doorGeometry(plan, d);
  if (!g) continue;
  parts.push(`<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="#1a2838" stroke-width="5"/>`);
  const dir = d.swing.endsWith('out') ? -1 : 1;
  const len = d.swing === 'double' ? d.width / 2 : d.width;
  const hinge = d.swing.startsWith('right') ? g.b : g.a;
  if (d.swing !== 'none') {
    parts.push(`<line x1="${hinge.x}" y1="${hinge.y}" x2="${hinge.x + g.normal.x * dir * len}" y2="${hinge.y + g.normal.y * dir * len}" stroke="#bfe6ff" stroke-width="0.9"/>`);
  }
}
for (const r of plan.rooms) {
  if (r.hideLabel) continue;
  const poly = boundaryPolyline(plan, r.boundary);
  const b = bbox(poly);
  const rot = r.label.angle ? ` rotate(${r.label.angle})` : '';
  const availW = (r.label.angle ? b.maxY - b.minY : b.maxX - b.minX) - 8;
  const primary = r.number || r.name;
  let fs = r.label.fontSize ?? Math.min(14, Math.max(6, ((r.label.angle ? b.maxX - b.minX : b.maxY - b.minY) - 6) / 3.2));
  const need = primary.length * 0.58 * fs;
  if (need > availW) fs = Math.max(5, availW / (primary.length * 0.58));
  const sec = r.number ? r.name : '';
  const secFs = fs * 0.62;
  const maxChars = Math.floor(availW / (0.58 * secFs));
  const secText = sec && maxChars >= 6 ? (sec.length > maxChars ? sec.slice(0, maxChars - 1) + '…' : sec) : '';
  parts.push(`<g transform="translate(${r.label.x} ${r.label.y})${rot}"><text font-size="${fs.toFixed(1)}" font-weight="600" fill="#e6f1fb" text-anchor="middle" dominant-baseline="middle" y="${secText ? -secFs * 0.55 : 0}">${esc(primary)}</text>` +
    (secText ? `<text font-size="${secFs.toFixed(1)}" fill="#cfe0f0" text-anchor="middle" dominant-baseline="middle" y="${(-secFs * 0.55 + fs * 0.62 + secFs * 0.6).toFixed(1)}">${esc(secText)}</text>` : '') + `</g>`);
}
if (showPoints) for (const [id, p] of Object.entries(plan.points)) parts.push(`<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="#0d1520" stroke="#4fd1ff"/><text x="${p.x + 3}" y="${p.y - 3}" font-size="5" fill="#ffb648">${id}</text>`);
parts.push('</svg>');
writeFileSync(out, parts.join('\n'));
console.log('written', out);
