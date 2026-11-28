import type { OemBranding } from "./oem-branding";

export function BrandMark({ branding }: { branding: OemBranding }) {
  return (
    <strong className="brand-mark">
      {branding.logo ? <img src={branding.logo} alt="" className="brand-logo" /> : null}
      <span>{branding.name || "Fonitas"}</span>
    </strong>
  );
}
