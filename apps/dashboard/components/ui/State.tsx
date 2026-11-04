// Standard loading / empty / error states, so every page says the same thing
// the same way. Styles live in app/ui.css (.uiState).
import Link from "next/link";
import type {ReactNode} from "react";
import CommandIcon, {type IconName} from "../CommandIcon";

type Action = {label: string; href?: string; onClick?: () => void; primary?: boolean};

function Actions({actions}: {actions?: Action[]}) {
  if (!actions?.length) return null;
  return (
    <div className="uiStateActions">
      {actions.map((a) =>
        a.href ? (
          <Link key={a.label} className={`uiButton${a.primary ? " primary" : ""}`} href={a.href}>{a.label}</Link>
        ) : (
          <button key={a.label} type="button" className={`uiButton${a.primary ? " primary" : ""}`} onClick={a.onClick}>{a.label}</button>
        ),
      )}
    </div>
  );
}

export function EmptyState({title, children, icon = "search", actions}: {title: string; children?: ReactNode; icon?: IconName; actions?: Action[]}) {
  return (
    <div className="uiState" role="status">
      <span className="uiStateIcon"><CommandIcon name={icon} size={20} /></span>
      <b>{title}</b>
      {children && <p>{children}</p>}
      <Actions actions={actions} />
    </div>
  );
}

export function LoadingState({label = "Loading…"}: {label?: string}) {
  return (
    <div className="uiState loading" aria-busy="true" role="status">
      <span className="uiSpinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({title = "Something went wrong", children, onRetry}: {title?: string; children?: ReactNode; onRetry?: () => void}) {
  return (
    <div className="uiState error" role="alert">
      <span className="uiStateIcon"><CommandIcon name="shield" size={20} /></span>
      <b>{title}</b>
      {children && <p>{children}</p>}
      <Actions actions={onRetry ? [{label: "Try again", onClick: onRetry, primary: true}] : undefined} />
    </div>
  );
}
