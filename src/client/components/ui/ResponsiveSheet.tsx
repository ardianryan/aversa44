import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ResponsiveSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}

/**
 * Responsive Sheet for all forms and detail drawers:
 * - Mobile (< md): slides smoothly up from bottom as a Bottom Sheet.
 * - Desktop (>= md): slides smoothly in from right as a Right Drawer Sheet.
 * Keeps mounted during closing animation for smooth exit transitions.
 */
export const ResponsiveSheet: React.FC<ResponsiveSheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'md:max-w-2xl',
  children,
}) => {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    } else {
      setVisible(false);
      const timer = window.setTimeout(() => setMounted(false), 300);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;
    const prevOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';

    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), iframe, [tabindex]:not([tabindex="-1"])'
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => (focusable()[0] ?? panelRef.current)?.focus());

    const onKeyDown = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== panelRef.current?.parentElement) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first || !last) {
          e.preventDefault();
          panelRef.current?.focus();
        } else if (e.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !panelRef.current?.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(frame);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mounted, open]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end"
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity duration-300 ease-out ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Sheet Surface: Bottom sheet on mobile, Right drawer on desktop */}
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 w-full ${maxWidthClass} max-h-[90dvh] md:max-h-dvh md:h-dvh flex flex-col rounded-t-3xl md:rounded-t-none md:rounded-l-3xl border-t-2 md:border-t-0 md:border-l-2 border-[#F5C538]/65 bg-[#250428] text-[#FFF5D6] shadow-[0_-16px_48px_rgba(0,0,0,0.65)] md:shadow-[-16px_0_48px_rgba(0,0,0,0.7)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          visible
            ? 'translate-y-0 md:translate-x-0 opacity-100'
            : 'translate-y-full md:translate-y-0 md:translate-x-full opacity-0'
        }`}
      >
        {/* Mobile grab indicator */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden="true">
          <div className="w-12 h-1.5 rounded-full bg-[#F5C538]/40" />
        </div>

        {/* Sticky Sheet Header */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-7 py-4 border-b border-[#F5C538]/25 bg-[#250428]/95 rounded-t-3xl md:rounded-tl-3xl md:rounded-tr-none shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg sm:text-xl font-extrabold text-[#FFF5D6] leading-snug">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[#F7D160] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label={`Tutup ${title}`}
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl border border-[#F5C538]/40 text-xs font-bold text-[#FDF39D] hover:bg-[#310603] shrink-0 transition-colors"
          >
            Tutup
          </button>
        </div>

        {/* Scrollable Sheet Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-7 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-5">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
