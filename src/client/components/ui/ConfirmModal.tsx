import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'gold';
  busy?: boolean;
}

/**
 * Compact centered Modal reserved strictly for simple yes/no confirmations.
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  tone = 'danger',
  busy = false,
}) => {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  cancelRef.current = onCancel;
  busyRef.current = busy;

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
      const timer = window.setTimeout(() => setMounted(false), 220);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const buttons = () => Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const frame = requestAnimationFrame(() => (buttons()[0] ?? dialogRef.current)?.focus());
    const onKeyDown = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
      if (e.key === 'Escape' && !busyRef.current) {
        e.preventDefault();
        cancelRef.current();
      } else if (e.key === 'Tab') {
        const elements = buttons();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first || !last) {
          e.preventDefault();
          dialogRef.current?.focus();
        } else if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(frame);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mounted, open]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div
        aria-hidden="true"
        onClick={() => !busy && onCancel()}
        className={`fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 w-full max-w-md rounded-2xl border-2 border-[#F5C538]/60 bg-[#250428] p-6 space-y-4 shadow-2xl transition-all duration-200 ease-out ${
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
        }`}
      >
        <h3 id={titleId} className="text-lg font-extrabold text-[#FDF39D]">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-[#FFF5D6]/85 leading-relaxed">{message}</p>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-[#F5C538]/40 text-xs font-bold text-[#FFF5D6] hover:bg-[#310603]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`min-h-[44px] px-5 py-2 rounded-xl text-xs font-extrabold transition-colors ${
              tone === 'danger'
                ? 'bg-[#7D1B05] border border-[#F5B8CB]/50 text-[#FFF5D6] hover:brightness-110'
                : 'bg-[#F5C538] text-[#310603] hover:brightness-105'
            }`}
          >
            {busy ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
