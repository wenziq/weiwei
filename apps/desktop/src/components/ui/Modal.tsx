import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children, footer, className = '', hideHeader = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; className?: string; hideHeader?: boolean }) {
  const dialog = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const target = dialog.current?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex="0"]');
      (target ?? dialog.current)?.focus();
    });
    const handler = (event: KeyboardEvent) => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'));
      if (dialogs.at(-1) !== dialog.current) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab' || !dialog.current) return;
      const elements = Array.from(dialog.current.querySelectorAll<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href], [tabindex="0"]')).filter(element => element.offsetParent !== null);
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0]!, last = elements[elements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', handler); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return createPortal(<div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeRef.current(); }}><section ref={dialog} tabIndex={-1} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={title}>
    {!hideHeader && <div className="dialog-head"><h2>{title}</h2><button className="icon-button" onClick={() => closeRef.current()} aria-label="关闭"><X size={16} /></button></div>}
    {children}{footer && <div className="dialog-actions">{footer}</div>}
  </section></div>, document.body);
}
