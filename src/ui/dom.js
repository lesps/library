// Tiny DOM helpers. User text only ever goes in as children (textContent); `html` is for static
// markup from this codebase (icons, cat art), never data.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) el.style.setProperty(p.startsWith('--') ? p : p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), x);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

export function openDialog(dlg) {
  document.body.append(dlg);
  try {
    dlg.showModal();
  } catch {
    dlg.setAttribute('open', '');
  }
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(dlg); }); // tap outside closes
  return dlg;
}

export function closeDialog(dlg) {
  try {
    dlg.close();
  } catch { /* not supported */ }
  dlg.remove();
}

const closeAll = (cls) => document.querySelectorAll(`dialog.${cls}`).forEach(closeDialog);

// A bottom sheet of choices. items: [{ label, onClick, danger, attrs }] or null for a divider.
export function sheet({ title, items }) {
  closeAll('sheet');
  const dlg = h('dialog', { class: 'sheet', 'aria-label': title });
  dlg.append(
    title ? h('h2', {}, title) : null,
    h('div', { class: 'sheet-items' }, items.filter((x) => x !== false).map((it) => (it == null ? h('hr') : h('button', {
      type: 'button',
      class: it.danger ? 'danger' : '',
      ...it.attrs,
      onclick: () => { closeDialog(dlg); it.onClick(); },
    }, it.label)))),
    h('button', { type: 'button', class: 'btn ghost sheet-cancel', onclick: () => closeDialog(dlg) }, 'Cancel'),
  );
  return openDialog(dlg);
}

export function confirmDialog({ title, body, ok = 'OK', danger = false, onConfirm }) {
  closeAll('confirm');
  const dlg = h('dialog', { class: 'confirm', 'aria-labelledby': 'confirm-title' },
    h('h2', { id: 'confirm-title' }, title),
    body ? h('p', {}, body) : null,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => closeDialog(dlg) }, 'Cancel'),
      h('button', { type: 'button', class: `btn ${danger ? 'danger' : 'primary'} confirm-ok`, onclick: () => { closeDialog(dlg); onConfirm(); } }, ok)));
  return openDialog(dlg);
}

export function promptDialog({ title, label, value = '', ok = 'Save', onSubmit }) {
  closeAll('prompt');
  const input = h('input', { class: 'prompt-input', type: 'text', value, 'aria-label': label, autocomplete: 'off', maxlength: 80 });
  const dlg = h('dialog', { class: 'prompt' });
  const submit = (e) => {
    e?.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    closeDialog(dlg);
    onSubmit(v);
  };
  dlg.append(h('form', { onsubmit: submit },
    h('h2', {}, title),
    h('label', {}, label, input),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => closeDialog(dlg) }, 'Cancel'),
      h('button', { type: 'button', class: 'btn primary prompt-ok', onclick: submit }, ok))));
  openDialog(dlg);
  input.focus();
  input.select?.();
  return dlg;
}

// A dialog with a form; fields: [{ name, label, value, type, hint, rows, inputmode }].
export function formDialog({ title, fields, ok = 'Save', onSubmit, extra }) {
  const inputs = {};
  const dlg = h('dialog', { class: 'form-dialog' });
  const submit = (e) => {
    e?.preventDefault();
    const values = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value]));
    if (onSubmit(values) === false) return;
    closeDialog(dlg);
  };
  dlg.append(h('form', { onsubmit: submit },
    h('h2', {}, title),
    fields.map((f) => {
      const el = f.rows
        ? h('textarea', { name: f.name, rows: f.rows, value: f.value ?? '' })
        : h('input', { name: f.name, type: f.type ?? 'text', value: f.type === 'checkbox' ? undefined : (f.value ?? ''), checked: f.type === 'checkbox' ? !!f.value : undefined, inputmode: f.inputmode, autocomplete: 'off' });
      inputs[f.name] = el;
      return h('label', { class: f.type === 'checkbox' ? 'check' : '' }, f.type === 'checkbox' ? [el, f.label] : [f.label, el], f.hint ? h('small', {}, f.hint) : null);
    }),
    extra ?? null,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => closeDialog(dlg) }, 'Cancel'),
      h('button', { type: 'button', class: 'btn primary', onclick: submit }, ok))));
  openDialog(dlg);
  return dlg;
}

// Text in a dialog with one Save: for notes and reviews.
export function textDialog({ title, value = '', placeholder = '', onSubmit }) {
  const ta = h('textarea', { rows: 8, value, placeholder });
  const dlg = h('dialog', { class: 'text-dialog' },
    h('h2', {}, title), ta,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => closeDialog(dlg) }, 'Cancel'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => { closeDialog(dlg); onSubmit(ta.value); } }, 'Save')));
  openDialog(dlg);
  ta.focus();
  return dlg;
}

export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
