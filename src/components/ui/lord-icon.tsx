import React from 'react';

// TypeScript declarations for the lord-icon web component
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'lord-icon': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          trigger?: 'hover' | 'click' | 'loop' | 'loop-on-hover' | 'morph' | 'morph-two-way' | 'boomerang' | 'in' | 'none';
          delay?: string | number;
          colors?: string;
          stroke?: string | number;
          state?: string;
          target?: string;
        },
        HTMLElement
      >;
    }
  }
}

// Map of icon names to Lordicon CDN URLs
export const LORDICON_URLS = {
  dashboard: 'https://cdn.lordicon.com/wmwqvixz.json',
  document: 'https://cdn.lordicon.com/pozplzfj.json',
  users: 'https://cdn.lordicon.com/kthelypq.json',
  logout: 'https://cdn.lordicon.com/moscwhoj.json',
  upload: 'https://cdn.lordicon.com/smwmetfi.json',
  mail: 'https://cdn.lordicon.com/diihvcfp.json',
  lock: 'https://cdn.lordicon.com/prjooket.json',
  check: 'https://cdn.lordicon.com/oqdnkrml.json',
  clock: 'https://cdn.lordicon.com/kbtmbyzy.json',
  search: 'https://cdn.lordicon.com/msoeawqm.json',
  trash: 'https://cdn.lordicon.com/skkahier.json',
  edit: 'https://cdn.lordicon.com/wloilxuq.json',
  plus: 'https://cdn.lordicon.com/jgnvfzqg.json',
  save: 'https://cdn.lordicon.com/hqymfzvj.json',
  user: 'https://cdn.lordicon.com/dxjqoygy.json',
  shield: 'https://cdn.lordicon.com/nocovwne.json',
  eye: 'https://cdn.lordicon.com/fmjvulzw.json',
  send: 'https://cdn.lordicon.com/ternnbni.json',
  arrowLeft: 'https://cdn.lordicon.com/zmkotitn.json',
  alert: 'https://cdn.lordicon.com/usownftb.json',
  download: 'https://cdn.lordicon.com/ternnbni.json',
  login: 'https://cdn.lordicon.com/hrjifpbq.json',
} as const;

export type LordIconName = keyof typeof LORDICON_URLS;

interface LordIconProps {
  icon: LordIconName | string;
  size?: number;
  trigger?: 'hover' | 'click' | 'loop' | 'loop-on-hover' | 'morph' | 'morph-two-way' | 'boomerang' | 'in' | 'none';
  delay?: number;
  colors?: { primary?: string; secondary?: string };
  stroke?: number;
  state?: string;
  target?: string;
  className?: string;
}

const LordIcon: React.FC<LordIconProps> = ({
  icon,
  size = 24,
  trigger = 'hover',
  delay,
  colors,
  stroke,
  state,
  target,
  className,
}) => {
  const src = icon in LORDICON_URLS
    ? LORDICON_URLS[icon as LordIconName]
    : icon;

  const colorString = colors
    ? `primary:${colors.primary || '#121331'},secondary:${colors.secondary || '#08a88a'}`
    : undefined;

  return (
    <lord-icon
      src={src}
      trigger={trigger}
      delay={delay ? String(delay) : undefined}
      colors={colorString}
      stroke={stroke ? String(stroke) : undefined}
      state={state}
      target={target}
      className={className}
      style={{ width: `${size}px`, height: `${size}px`, display: 'inline-flex' }}
    />
  );
};

export default LordIcon;
