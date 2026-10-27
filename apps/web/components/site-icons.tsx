import type { AutomaticIconId } from "@platform/website-engine";

/**
 * Site service icons (BSRC-DESIGN-P5-001). Inline SVG, stroke-drawn on
 * currentColor so the icon inherits the card's text/accent token — never
 * emoji, never raster. One consistent style per site via design.iconStyle
 * ("line" = stroked, "solid" = filled); ids come from the engine's
 * semantic mapper. Rendered only when a document's design block opts in,
 * so every pre-existing site keeps its exact pixels.
 */

const paths: Record<AutomaticIconId, React.ReactNode> = {
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 2.8V6m8-3.2V6" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h10" /></>,
  delivery: <><path d="M3.5 7h9v9h-9zM12.5 10H17l3.5 3v3h-8" /><circle cx="7" cy="18.5" r="1.8" /><circle cx="17" cy="18.5" r="1.8" /></>,
  pin: <><path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 12 4a6.5 6.5 0 0 0-6.5 6.6C5.5 15.4 12 21 12 21Z" /><circle cx="12" cy="10.4" r="2.3" /></>,
  phone: <><path d="M6.8 3.8h3l1.5 4-2 1.5a12.5 12.5 0 0 0 5.4 5.4l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.8 6a2 2 0 0 1 2-2.2Z" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4.5 7 7.5 6 7.5-6" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.4l3.4 2" /></>,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3.4 2.7-5.2 5.5-5.2s4.9 1.8 5.5 5.2M15.5 5.9a3.2 3.2 0 0 1 0 5.2M17.5 14.6c1.8.7 2.9 2.3 3.3 4.6" /></>,
  scissors: <><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="6.5" cy="17.5" r="2.5" /><path d="M8.6 8.1 19.5 19M8.6 15.9 19.5 5" /></>,
  palette: <><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.8 2-1.7 0-1.3-1.1-1.8-1.1-3 0-1.2 1-2 2.4-2h2A3.2 3.2 0 0 0 20.5 10 8.6 8.6 0 0 0 12 3.5Z" /><circle cx="8" cy="10" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16" cy="10" r="1" /></>,
  spark: <><path d="M12 3.5 13.9 9 19.5 11 13.9 13 12 18.5 10.1 13 4.5 11 10.1 9Z" /><path d="M18.5 3v3M17 4.5h3" /></>,
  droplet: <><path d="M12 3.5s6 6.2 6 10.2a6 6 0 0 1-12 0c0-4 6-10.2 6-10.2Z" /></>,
  wrench: <><path d="M14.5 6.5a4.5 4.5 0 0 0-6 5.6L4 16.6a2 2 0 0 0 2.9 2.9l4.5-4.5a4.5 4.5 0 0 0 5.6-6l-2.9 2.9-2.4-2.4Z" /></>,
  crane: <><path d="M5 21V4.5L18 8M5 8.5h13M9 21v-5h4v5M16.5 8v5.5M14.7 16.5h3.6l-1.8-3Z" /></>,
  blueprint: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M7.5 15.5v-4h4v4M14 9h3.5M14 12.5h3.5M7.5 8h10" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20M6.3 6.3l1.6 1.6M16.1 16.1l1.6 1.6M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6" /></>,
  dumbbell: <><path d="M7 8v8M4.5 9.5v5M17 8v8M19.5 9.5v5M7 12h10" /></>,
  lotus: <><path d="M12 5c1.6 1.8 2.4 3.7 2.4 5.7S13.6 14.6 12 16c-1.6-1.4-2.4-3.3-2.4-5.3S10.4 6.8 12 5ZM4.5 10.5c2.4.4 4.3 1.5 5.5 3.3M19.5 10.5c-2.4.4-4.3 1.5-5.5 3.3M3.5 15c2.6 2.4 5.4 3.6 8.5 3.6s5.9-1.2 8.5-3.6" /></>,
  camera: <><rect x="3.5" y="7" width="17" height="12.5" rx="2.5" /><path d="M8.5 7 10 4.5h4L15.5 7" /><circle cx="12" cy="13" r="3.2" /></>,
  bed: <><path d="M3.5 18.5v-8M3.5 13h17v5.5M6 13V9.5h5V13M20.5 18.5v-3a2.5 2.5 0 0 0-2.5-2.5" /></>,
  coffee: <><path d="M5 8.5h11v6a4.5 4.5 0 0 1-4.5 4.5H9.5A4.5 4.5 0 0 1 5 14.5ZM16 9.5h1.8a2.4 2.4 0 0 1 0 4.8H16M7.5 5.5V4m3.5 1.5V4m3.5 1.5V4" /></>,
  bag: <><path d="M5.5 8.5h13l-1 11.5h-11ZM8.8 8.5V7a3.2 3.2 0 0 1 6.4 0v1.5" /></>,
  key: <><circle cx="8" cy="15.5" r="4" /><path d="m11 12.5 8.5-8.5M16 4.5l3.5 3.5M13.8 6.7l2.8 2.8" /></>,
  scale: <><path d="M12 4v16M6 20h12M12 6 5.5 8M12 6l6.5 2M3.5 13.5 5.5 8l2 5.5a2.4 2.4 0 0 1-4 0ZM16.5 13.5 18.5 8l2 5.5a2.4 2.4 0 0 1-4 0Z" /></>,
  heart: <><path d="M12 20s-7.5-4.6-7.5-9.8A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" /></>,
  leaf: <><path d="M19.5 4.5c.6 8.5-3.3 13.5-9.5 13.5-2.6 0-4.5-1-5.5-2.5C6 10 11 5.4 19.5 4.5ZM4.5 19.5C8 15 12 12 16 10" /></>,
  shield: <><path d="M12 3.5 19 6v5.5c0 4.6-3 8-7 9.5-4-1.5-7-4.9-7-9.5V6Z" /><path d="m9 11.6 2.2 2.2 4-4.2" /></>,
  star: <><path d="m12 4 2.3 5 5.2.6-3.9 3.6 1.1 5.3L12 15.8l-4.7 2.7 1.1-5.3L4.5 9.6l5.2-.6Z" /></>,
  award: <><circle cx="12" cy="9.5" r="5.5" /><path d="m9 14.3-1.5 6.2 4.5-2.4 4.5 2.4-1.5-6.2M12 7.2l.8 1.6 1.7.3-1.2 1.2.2 1.7-1.5-.8-1.5.8.2-1.7-1.2-1.2 1.7-.3Z" /></>,
  gauge: <><path d="M4.5 17a8.5 8.5 0 1 1 15 0M12 13.5 15.5 9" /><circle cx="12" cy="14.5" r="1.4" /></>,
  "dot-a": <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" strokeDasharray="3.4 3.4" /></>,
  "dot-b": <><rect x="6" y="6" width="12" height="12" rx="2.5" /><path d="M9.5 12h5" /></>,
  "dot-c": <><path d="M12 4.5 19.5 12 12 19.5 4.5 12Z" /></>,
  "dot-d": <><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18" /></>,
};

export function SiteServiceIcon({ icon, style }: { icon: AutomaticIconId; style: "line" | "solid" }) {
  const solid = style === "solid";
  return (
    <svg
      className="site-service-icon"
      data-icon={icon}
      viewBox="0 0 24 24"
      fill={solid ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={solid ? 1 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[icon]}
    </svg>
  );
}
