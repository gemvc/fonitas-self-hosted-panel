import { useEffect, useId, useRef, useState } from "react";
import { ChevronIcon, ProfileIcon, SignOutIcon, TicketIcon } from "./icons";
import type { messages } from "./locale";

type Text = typeof messages.en;

export function ProfileMenu({
  t,
  displayName,
  onProfile,
  onTicket,
  onSignOut,
}: {
  t: Text;
  displayName: string;
  onProfile: () => void;
  onTicket: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="profile-menu" ref={root}>
      <button
        type="button"
        className="profile-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t.profileMenuLabel}
        onClick={() => setOpen(value => !value)}
      >
        <span className="profile-avatar" aria-hidden="true">{initial}</span>
        <span className="profile-trigger-name">{displayName}</span>
        <ChevronIcon className={open ? "profile-chevron open" : "profile-chevron"} />
      </button>

      {open && (
        <div className="profile-dropdown" role="menu" id={menuId}>
          <button type="button" role="menuitem" className="profile-dropdown-item"
            onClick={() => choose(onProfile)}>
            <ProfileIcon />
            <span>{t.navProfile}</span>
          </button>
          <button type="button" role="menuitem" className="profile-dropdown-item"
            onClick={() => choose(onTicket)}>
            <TicketIcon />
            <span>{t.sendTicket}</span>
          </button>
          <button type="button" role="menuitem" className="profile-dropdown-item"
            onClick={() => choose(onSignOut)}>
            <SignOutIcon />
            <span>{t.signOut}</span>
          </button>
        </div>
      )}
    </div>
  );
}
