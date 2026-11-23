import { useEffect } from "react";

// Closes a popover when the user clicks outside it or presses Escape.
export default function usePopover(ref, open, setOpen, onEscape) {
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        onEscape?.();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}
