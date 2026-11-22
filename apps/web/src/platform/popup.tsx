import { useLayoutEffect, useRef } from 'react';
import type { ComponentPropsWithoutRef, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

type Props = Pick<ComponentPropsWithoutRef<'section'>,
  'id' | 'className' | 'aria-labelledby' | 'aria-describedby' | 'role' | 'children'> & {
  onDismiss?: () => void; locked?: boolean; closeLabel?: string; mode?: 'modal' | 'board';
};

export function Popup({ mode = 'modal', onDismiss, locked, closeLabel, className = '', role, children, ...aria }: Props) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const outside = useRef(false);
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [mode]);
  const dismiss = () => { if (!locked) onDismiss?.(); };
  function isOutside(event: PointerEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return false;
    if (mode === 'board') return true;
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top || event.clientY >= bounds.bottom;
  }
  const pointerHandlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => { outside.current = isOutside(event); },
    onPointerUp: (event: PointerEvent<HTMLElement>) => { if (outside.current && isOutside(event)) dismiss(); outside.current = false; },
  };
  const close = onDismiss && <button className="settings-close popup-close" type="button" disabled={locked}
    aria-label={closeLabel ?? t('close')} onClick={dismiss}><span aria-hidden="true" /></button>;
  return mode === 'board' ? <div className="popup-board-layer" {...pointerHandlers}
    onKeyDown={event => { if (event.key === 'Escape' && onDismiss) { event.preventDefault(); event.stopPropagation(); dismiss(); } }}>
    <section {...aria} role={role ?? 'dialog'} className={'surface popup-surface ' + className}>{close}{children}</section>
  </div> : <dialog {...aria} className={'surface profile-dialog popup-surface ' + className} ref={dialog} {...pointerHandlers}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); dismiss(); }}>{children}{close}</dialog>;
}
