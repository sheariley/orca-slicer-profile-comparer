import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useId,
  useInteractions,
  type OpenChangeReason,
} from '@floating-ui/react';
import { useState, type ReactNode } from 'react';

interface InfoTipProps {
  /** What the tip is about. Names the info button for assistive tech ("About <subject>"). */
  readonly subject: string;
  readonly content: ReactNode;
  /** The element the tip describes. Hovering it shows the tip too. */
  readonly children?: ReactNode;
}

/** Changes a pinned tip ignores: only an explicit dismissal or a second tap closes it. */
const PASSIVE_REASONS: ReadonlySet<OpenChangeReason> = new Set([
  'hover',
  'safe-polygon',
  'focus',
  'focus-out',
]);

/*
 * Built on @floating-ui/react, whose interaction hooks (useHover, useFocus, useDismiss) are
 * designed to be combined with click triggers. Rejected: Radix Tooltip and React Aria's
 * TooltipTrigger (both deliberately open only on hover/focus, never on tap), and
 * @tippyjs/react (unmaintained since 2022).
 */

/**
 * A tooltip that works with mouse, touch, and keyboard, per the UI/UX rules in AGENTS.md:
 * hovering the element (or focusing its info button) shows the tip; clicking or tapping the
 * info button pins it open until a second tap, a tap outside, or Escape.
 * Use this for every tooltip. Never use `title` attributes.
 */
export function InfoTip({ subject, content, children }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const tipId = useId();

  const {
    refs: { setReference, setFloating },
    floatingStyles,
    context,
  } = useFloating({
    open,
    onOpenChange(next, _event, reason) {
      if (!next && pinned && reason && PASSIVE_REASONS.has(reason)) return;
      setOpen(next);
      if (!next) setPinned(false);
    },
    placement: 'top',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    // mouseOnly: a tap is a click on the info button, not a hover.
    useHover(context, {
      mouseOnly: true,
      delay: { open: 250, close: 100 },
      handleClose: safePolygon(),
    }),
    useFocus(context),
    useDismiss(context),
  ]);

  const togglePinned = () => {
    setPinned(!pinned);
    setOpen(!pinned);
  };

  return (
    <>
      <span ref={setReference} className="info-tip-anchor" {...getReferenceProps()}>
        {children}
        <button
          type="button"
          className="info-tip-button"
          aria-label={`About ${subject}`}
          aria-expanded={open}
          aria-describedby={open ? tipId : undefined}
          onClick={togglePinned}
        >
          <InfoIcon />
        </button>
      </span>
      {open && (
        <FloatingPortal>
          <div
            ref={setFloating}
            id={tipId}
            role="tooltip"
            className="info-tip"
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7.25" y="7" width="1.5" height="4.5" rx="0.75" fill="currentColor" />
      <circle cx="8" cy="4.75" r="0.9" fill="currentColor" />
    </svg>
  );
}
