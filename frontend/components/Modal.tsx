"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  center?: boolean;
  maxWidth?: number;
}

export default function Modal({ open, onClose, children, center = false, maxWidth = 700 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) { document.addEventListener("keydown", handler); document.body.style.overflow = "hidden"; }
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-end justify-center"
          style={{ alignItems: center ? "center" : "flex-end", padding: center ? "20px" : "0" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[6px]" />

          {/* Panel */}
          <motion.div
            ref={ref}
            className="relative w-full z-10 bg-[var(--color-surface-2)] overflow-y-auto overflow-x-hidden"
            style={{
              borderRadius: center ? 16 : "18px 18px 0 0",
              maxWidth: `${maxWidth}px`,
              maxHeight: center ? "90vh" : "93vh",
              boxShadow: center
                ? "0 16px 48px rgba(0,0,0,.12), 0 4px 16px rgba(0,0,0,.06)"
                : "0 -12px 60px rgba(0,0,0,.15)",
              padding: "30px 28px 48px",
            }}
            initial={{ y: center ? 0 : 28, scale: center ? 0.96 : 1, opacity: center ? 0 : 1 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: center ? 0 : 20, scale: center ? 0.96 : 1, opacity: center ? 0 : 0.6 }}
            transition={{ duration: 0.3, ease: [0.34, 1.05, 0.64, 1] }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="sticky top-0 float-right mb-[-28px] w-7 h-7 rounded-full z-10
                bg-[var(--color-paper-2)] border border-[var(--color-border)]
                text-[var(--color-ink-3)] flex items-center justify-center
                hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]
                transition-all duration-150 cursor-pointer"
              style={{ marginBottom: -28 }}
            >
              <X size={11} strokeWidth={2.5} />
            </button>

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
