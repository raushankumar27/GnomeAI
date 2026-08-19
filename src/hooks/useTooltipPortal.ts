import { useEffect } from 'react';

/**
 * Global Portal Tooltip Engine Hook
 * Listens for mouseover/mouseout events across the entire DOM to position and render
 * tooltips smoothly without clipping or container boundary bugs.
 */
export function useTooltipPortal() {
  useEffect(() => {
    let currentTarget: HTMLElement | null = null;

    const getTooltipEl = () => {
      let el = document.getElementById('gnomeai-tooltip-root');
      if (!el) {
        el = document.createElement('div');
        el.id = 'gnomeai-tooltip-root';
        document.body.appendChild(el);
      }
      return el;
    };

    const showTooltip = (target: HTMLElement, text: string) => {
      const tooltipEl = getTooltipEl();
      tooltipEl.textContent = text;
      tooltipEl.classList.add('visible');

      const rect = target.getBoundingClientRect();
      const tooltipRect = tooltipEl.getBoundingClientRect();

      let top = rect.top - tooltipRect.height - 8;
      let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

      // Flip below if close to top edge
      if (top < 6) {
        top = rect.bottom + 8;
      }

      // Clamp left/right to prevent screen boundary cropping
      const padding = 10;
      if (left < padding) {
        left = padding;
      } else if (left + tooltipRect.width > window.innerWidth - padding) {
        left = window.innerWidth - tooltipRect.width - padding;
      }

      tooltipEl.style.top = `${Math.round(top)}px`;
      tooltipEl.style.left = `${Math.round(left)}px`;
    };

    const hideTooltip = () => {
      const el = document.getElementById('gnomeai-tooltip-root');
      if (el) {
        el.classList.remove('visible');
      }
      currentTarget = null;
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('[title], [data-tooltip]') as HTMLElement;
      if (target) {
        if (target.hasAttribute('title')) {
          const titleText = target.getAttribute('title');
          if (titleText && titleText.trim()) {
            target.setAttribute('data-tooltip', titleText);
            target.removeAttribute('title');
          }
        }
        const text = target.getAttribute('data-tooltip');
        if (text && text.trim() && target !== currentTarget) {
          currentTarget = target;
          showTooltip(target, text);
        }
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      if (currentTarget && !currentTarget.contains(e.relatedTarget as Node)) {
        hideTooltip();
      }
    };

    const handleScrollOrClick = () => {
      hideTooltip();
    };

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    window.addEventListener('scroll', handleScrollOrClick, true);
    window.addEventListener('click', handleScrollOrClick, true);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
      window.removeEventListener('scroll', handleScrollOrClick, true);
      window.removeEventListener('click', handleScrollOrClick, true);
    };
  }, []);
}
