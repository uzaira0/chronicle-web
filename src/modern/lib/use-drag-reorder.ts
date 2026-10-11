import { type DragEvent, useCallback, useRef, useState } from 'react';

export function moveItem<T>(items: T[], source: number, target: number): T[] {
  if (source === target || source < 0 || source >= items.length || target < 0 || target >= items.length) return items;
  const updated = [...items];
  const [moved] = updated.splice(source, 1);
  if (moved === undefined) return items;
  updated.splice(target, 0, moved);
  return updated;
}

export function useDragReorder(onMove: (source: number, target: number) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
    setIsDragging(true);
  }, []);
  const handleDragOver = useCallback(
    (event: DragEvent, index: number) => {
      event.preventDefault();
      const dragIndex = dragIndexRef.current;
      if (dragIndex === null || dragIndex === index || rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const currentDragIndex = dragIndexRef.current;
        if (currentDragIndex === null || currentDragIndex === index) return;
        onMove(currentDragIndex, index);
        dragIndexRef.current = index;
      });
    },
    [onMove],
  );
  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setIsDragging(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);
  return { handleDragStart, handleDragOver, handleDragEnd, isDragging };
}
