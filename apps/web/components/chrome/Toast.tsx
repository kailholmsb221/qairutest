'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useUiStore } from '@/lib/store/uiStore';

export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const setToast = useUiStore((s) => s.setToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast, setToast]);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div className="toast glass" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }} onClick={() => setToast(null)} data-testid="toast">
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
