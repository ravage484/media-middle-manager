import { useEffect } from 'react';

// Escape closes the window on top only. Windows can open over each other (a person over a title over a library card), and each marks its
// overlay with data-layer: the one last in the page is on top. Capture phase and stopped, so a window under it does not also close.
export function useTopEscape(ref, onClose) {
  useEffect(() => {
    const esc = (e) => {
      if (e.key !== 'Escape') return;
      const layers = document.querySelectorAll('[data-layer]');
      if (layers.length && layers[layers.length - 1] !== ref.current) return; // another window is above this one
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
}
