import type { SVGProps } from 'react';

const base = (d: string) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      >
        <path d={d} />
      </svg>
    );
  };

export const HomeIcon = base('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z');
export const PlusIcon = base('M12 5v14M5 12h14');
export const CalendarIcon = base(
  'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
);
export const ListIcon = base('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01');
export const LayersIcon = base('m12 3 9 5-9 5-9-5zM3 13l9 5 9-5');
export const GridIcon = base('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z');
export const LogoutIcon = base('M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11');
export const ArrowRightIcon = base('M5 12h14M13 6l6 6-6 6');
export const CheckIcon = base('m5 12.5 4.5 4.5L19 7');
export const ClockIcon = base('M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z');
export const TrashIcon = base('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3');
export const BriefcaseIcon = base(
  'M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 7h16a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1zM3 12h18',
);
export const SparkIcon = base(
  'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
);
