import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} />
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.25c1.6-3.1 3.9-4.65 6.5-4.65s4.9 1.55 6.5 4.65" />
    </Icon>
  );
}

export function TicketIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 9.5V7.75A1.75 1.75 0 0 1 6.25 6h11.5A1.75 1.75 0 0 1 19.5 7.75v1.75a1.75 1.75 0 1 0 0 3.5v1.75A1.75 1.75 0 0 1 17.75 16.5H6.25A1.75 1.75 0 0 1 4.5 14.75V13a1.75 1.75 0 1 0 0-3.5Z" />
      <path d="M12 9.25v5.5" />
    </Icon>
  );
}

export function SignOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 5.5H7.75A2.25 2.25 0 0 0 5.5 7.75v8.5A2.25 2.25 0 0 0 7.75 18.5H10" />
      <path d="M13.5 15.5 17.5 12l-4-3.5" />
      <path d="M17.25 12H10" />
    </Icon>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m7 10 5 5 5-5" />
    </Icon>
  );
}
