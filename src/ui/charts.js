// A small column chart: one series, so no legend (the caption names it). Thin columns with rounded
// tops on one baseline; the tallest (and the selected one) carry their value; every column describes
// itself to screen readers and shows a readout on hover or focus. Text never takes the data colour.
import { h } from './dom.js';

// data: [{ key, axis, value, label (full description), tip }]. With onSelect, columns are buttons and
// the selected one is emphasized (the rest go gray).
export function columnChart({ cls, caption, data, selected = null, onSelect = null }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.reduce((best, d) => (d.value > (best?.value ?? 0) ? d : best), null);
  const tip = h('div', { class: 'chart-tip', role: 'presentation', hidden: true });
  const show = (col, d) => {
    tip.textContent = d.tip;
    tip.hidden = false;
    const plot = col.parentElement;
    const x = col.offsetLeft + col.offsetWidth / 2 - tip.offsetWidth / 2;
    tip.style.left = `${Math.max(0, Math.min(x, plot.clientWidth - tip.offsetWidth))}px`;
  };
  const hide = () => { tip.hidden = true; };

  const cols = data.map((d) => {
    const labelled = d.value > 0 && (d === peak || d.key === selected);
    const attrs = {
      class: `col${selected != null ? (d.key === selected ? ' on' : ' off') : ''}`,
      'data-key': String(d.key),
      'aria-label': d.label,
      style: { '--v': String(d.value / max) },
    };
    const col = onSelect
      ? h('button', { ...attrs, type: 'button', 'aria-pressed': String(d.key === selected), onclick: () => onSelect(d.key) })
      : h('div', { ...attrs, role: 'img', tabindex: '0' });
    col.append(
      h('span', { class: 'col-value', 'aria-hidden': 'true' }, labelled ? String(d.value) : ''),
      h('span', { class: `col-bar${d.value ? '' : ' zero'}`, 'aria-hidden': 'true' }));
    for (const t of ['pointerenter', 'focus']) col.addEventListener(t, () => show(col, d));
    for (const t of ['pointerleave', 'blur']) col.addEventListener(t, hide);
    return col;
  });

  return h('figure', { class: `chart ${cls}` },
    h('figcaption', {}, caption),
    h('div', { class: 'chart-plot' }, cols, tip),
    h('div', { class: 'chart-axis', 'aria-hidden': 'true' }, data.map((d) => h('span', { class: d.key === selected ? 'on' : '' }, d.axis))));
}
