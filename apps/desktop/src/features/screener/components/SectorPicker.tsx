import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { Sector } from '@weiwei/contracts';

interface SectorPickerProps {
  options: Sector[];
  value: string;
  kind: '行业' | '概念';
  onChange: (value: string) => void;
}

export function SectorPicker({ options, value, kind, onChange }: SectorPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState({ upward: false, maxHeight: 460 });
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const listId = `sector-picker-${id}`;
  const choices = useMemo(() => {
    const known = value && options.some(item => item.name === value);
    return [...options, ...(value && !known ? [{ name: value, dataSource: '历史条件' } as Sector] : [])];
  }, [options, value]);
  const filtered = useMemo(() => {
    const keywords = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return choices.filter(item => keywords.every(keyword => item.name.toLocaleLowerCase().includes(keyword)));
  }, [choices, query]);
  const groups = useMemo(() => {
    const result = new Map<string, { item: Sector; index: number }[]>();
    filtered.forEach((item, index) => {
      const source = item.dataSource || '其他来源';
      result.set(source, [...(result.get(source) ?? []), { item, index }]);
    });
    return [...result.entries()];
  }, [filtered]);

  useEffect(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, [kind]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const toggle = () => {
    if (!open && root.current) {
      const rect = root.current.getBoundingClientRect();
      const above = rect.top - 16;
      const below = window.innerHeight - rect.bottom - 16;
      const upward = below < 340 && above > below;
      setPlacement({ upward, maxHeight: Math.max(180, upward ? above : below) });
    }
    setOpen(current => !current);
    setQuery('');
    setActive(0);
  };
  const select = (name: string) => {
    onChange(name);
    setOpen(false);
    setQuery('');
    setActive(0);
  };
  return <div className="sector-picker" ref={root}>
    <button type="button" className={`sector-picker-trigger${open ? ' open' : ''}`} aria-label="条件可选值" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={toggle}>
      <span className={value ? '' : 'placeholder'}>{value || `搜索并选择${kind}`}</span><ChevronDown size={16} />
    </button>
    {open && <div className={`sector-picker-panel${placement.upward ? ' upward' : ''}`} style={{ maxHeight: placement.maxHeight }}>
      <div className="sector-picker-search"><Search size={16} /><input ref={input} role="combobox" aria-label={`搜索${kind}`} aria-autocomplete="list" aria-expanded aria-controls={listId} aria-activedescendant={filtered.length ? `${listId}-${active}` : undefined} value={query} placeholder={`输入${kind}名称关键词，例如：算力`} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(current => Math.min(current + 1, Math.max(filtered.length - 1, 0))); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(current => Math.max(current - 1, 0)); }
        if (event.key === 'Enter' && filtered[active]) { event.preventDefault(); select(filtered[active].name); }
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      }} /><span>{filtered.length} / {choices.length}</span></div>
      <div className="sector-picker-list" id={listId} role="listbox" aria-label={`${kind}候选列表`} ref={list}>
        {groups.map(([source, items]) => <section className="sector-picker-group" key={source} role="group" aria-label={`${source}${kind}`}>
          <h4>{source}<span>{kind} · {items.length}</span></h4>
          <div className="sector-picker-options">{items.map(({ item, index }) => <button type="button" role="option" aria-selected={item.name === value} id={`${listId}-${index}`} data-index={index} className={index === active ? 'active' : ''} key={item.name} title={item.name} onMouseEnter={() => setActive(index)} onClick={() => select(item.name)}><span>{item.name}</span>{item.name === value && <Check size={15} />}</button>)}</div>
        </section>)}
        {!filtered.length && <div className="sector-picker-empty"><strong>没有找到“{query.trim()}”</strong><span>请尝试更短的关键词，或检查名称是否完整。</span></div>}
      </div>
      <p className="sector-picker-help">按名称包含关系匹配 · ↑↓ 移动 · Enter 选择 · Esc 关闭</p>
    </div>}
  </div>;
}
