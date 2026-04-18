'use client';

import { useEffect } from 'react';

const CONSOLE_METHODS = ['log', 'info', 'debug', 'warn', 'error', 'trace'] as const;

const isScrollableElement = (element: Element | null): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const canScrollY =
    overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';

  return canScrollY && element.scrollHeight > element.clientHeight + 1;
};

const findScrollableAncestor = (target: EventTarget | null) => {
  let current = target instanceof Element ? target : null;

  while (current) {
    if (isScrollableElement(current)) {
      return current;
    }
    current = current.parentElement;
  }

  const scrollingElement = document.scrollingElement;
  return scrollingElement instanceof HTMLElement ? scrollingElement : null;
};

const shouldBlockOverscroll = (target: EventTarget | null, deltaY: number) => {
  if (deltaY === 0) {
    return false;
  }

  const scrollable = findScrollableAncestor(target);
  if (!scrollable) {
    return false;
  }

  const atTop = scrollable.scrollTop <= 0;
  const atBottom =
    scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;

  if (deltaY < 0 && atTop) {
    return true;
  }

  if (deltaY > 0 && atBottom) {
    return true;
  }

  return false;
};

export function SiteGuards() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const debugMode =
      params.get('debug') === '1' || params.get('debug') === 'true';

    let lastTouchY = 0;

    const handleWheel = (event: WheelEvent) => {
      if (shouldBlockOverscroll(event.target, event.deltaY)) {
        event.preventDefault();
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? 0;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const currentTouchY = event.touches[0]?.clientY ?? lastTouchY;
      const deltaY = lastTouchY - currentTouchY;

      if (shouldBlockOverscroll(event.target, deltaY)) {
        event.preventDefault();
      }

      lastTouchY = currentTouchY;
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    const originalConsole = Object.fromEntries(
      CONSOLE_METHODS.map((method) => [method, console[method].bind(console)]),
    ) as Record<(typeof CONSOLE_METHODS)[number], typeof console.log>;

    if (!debugMode) {
      for (const method of CONSOLE_METHODS) {
        console[method] = () => {};
      }
    }

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);

      if (!debugMode) {
        for (const method of CONSOLE_METHODS) {
          console[method] = originalConsole[method];
        }
      }
    };
  }, []);

  return null;
}
