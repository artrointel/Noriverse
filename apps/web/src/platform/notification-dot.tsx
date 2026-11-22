import { useEffect, useState } from 'react';

function readSeen(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

export function useUnreadNotice(owner: string | undefined, topic: string, ids: readonly string[] | undefined, viewing: boolean) {
  const key = owner ? 'noriverse:seen:' + topic + ':' + owner : undefined;
  const [seen, setSeen] = useState<{ key: string; ids: string[] }>();

  useEffect(() => {
    if (!key) return;
    const storageKey = key;
    function restore(value: string | null) { setSeen({ key: storageKey, ids: readSeen(value) }); }
    try { restore(localStorage.getItem(key)); } catch { /* Storage may be disabled. */ }
    function onStorage(event: StorageEvent) {
      if (event.key === key || event.key === null) restore(event.newValue);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  useEffect(() => {
    if (!key || !ids || !viewing) return;
    const storageKey = key;
    const noticeIds = [...ids].sort();
    function markSeen() {
      if (document.hidden) return;
      setSeen({ key: storageKey, ids: noticeIds });
      try {
        const value = JSON.stringify(noticeIds);
        if (localStorage.getItem(storageKey) !== value) localStorage.setItem(storageKey, value);
      } catch { /* In-memory acknowledgement still works. */ }
    }
    markSeen();
    document.addEventListener('visibilitychange', markSeen);
    return () => document.removeEventListener('visibilitychange', markSeen);
  }, [key, ids, viewing]);

  return Boolean(key && !viewing && ids?.some(id => seen?.key !== key || !seen?.ids.includes(id)));
}

export function NotificationDot({ visible, label }: { visible: boolean; label?: string }) {
  return visible ? <span className="notification-dot" aria-hidden={label ? undefined : true}>
    {label && <span className="visually-hidden">{label}</span>}
  </span> : null;
}
