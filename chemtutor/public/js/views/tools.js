import { h } from '../ui.js';
import { renderChemTools } from '../chem/tools.js';

export default function tools(el, { tab }) {
  const box = h('div');
  el.append(h('div.page-head', h('div', h('h1', 'Химические инструменты'),
    h('div.sub', 'Таблица Менделеева, калькуляторы и тренажёры — работают и без интернета'))), box);
  renderChemTools(box, tab);
}
