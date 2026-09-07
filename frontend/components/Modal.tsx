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

export default function Modal({ open, onClose, children, center=false, maxWidth=700 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key==="Escape") onClose(); };
    if (open) { document.addEventListener("keydown",h); document.body.style.overflow="hidden"; }
    return () => { document.removeEventListener("keydown",h); document.body.style.overflow=""; };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`overlay${center?" overlay-center":""}`}
          initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
          transition={{ duration:0.22 }}
          onClick={e => { if (e.target===e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={ref}
            className={`modal-panel${center?" modal-panel-center":""}`}
            style={{ maxWidth }}
            initial={{ y: center?0:28, scale: center?0.96:1, opacity: center?0:1 }}
            animate={{ y:0, scale:1, opacity:1 }}
            exit={{ y: center?0:20, scale: center?0.96:1, opacity: center?0:0.6 }}
            transition={{ duration:0.3, ease:[0.34,1.05,0.64,1] }}
          >
            <button onClick={onClose} className="modal-close">
              <X size={11} strokeWidth={2.5} />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
