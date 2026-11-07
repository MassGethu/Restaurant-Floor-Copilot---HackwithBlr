import { useEffect, useRef } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  LayoutGrid,
  Menu,
  Plus,
  X,
} from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { navigation, operationsView } from "../lib/workspaceNavigation";
import "./workspace.css";

export default function Layout() {
  const { pathname, search, hash } = useLocation();
  const menu = useRef<HTMLDialogElement>(null);
  let currentPath = pathname.toLowerCase().replace(/\/+$/, "");
  if (currentPath === "/operations") {
    const view = operationsView(search);
    if (view !== "staff") currentPath = `/operations?tab=${view}`;
  } else if (currentPath.startsWith("/setup/")) {
    currentPath = "/setup";
  }
  const currentGroup = navigation.find(({ items }) =>
    items.some(({ to }) => to === currentPath),
  );
  const current = currentGroup?.items.find(({ to }) => to === currentPath);

  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, search, hash]);

  function links(onNavigate?: () => void) {
    return navigation.map(({ label, items }) => (
      <div className="workspace-nav-group" key={label}>
        <p>{label}</p>
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            aria-current={to === currentPath ? "page" : undefined}
            onClick={onNavigate}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </div>
    ));
  }

  return (
    <div className="workspace">
      <a className="workspace-skip" href="#workspace-main">
        Skip to content
      </a>
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" to="/floor">
          <span className="workspace-mark">
            <LayoutGrid size={19} aria-hidden="true" />
          </span>
          <span>
            <strong>Floor Copilot</strong>
            <small>Restaurant workspace</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">{links()}</nav>
        <Link className="workspace-handover" to="/supervisor#handover">
          <span>Shift handover</span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </aside>

      <div className="workspace-content">
        <header className="workspace-topbar">
          <div className="workspace-trail">
            <span>{currentGroup?.label ?? "Workspace"}</span>
            <ChevronRight size={14} aria-hidden="true" />
            <strong>{current?.label ?? "Floor overview"}</strong>
          </div>
          <Link className="workspace-add" to="/floor#add-party">
            <Plus size={17} aria-hidden="true" />
            Add party
          </Link>
        </header>
        <main className="workspace-main" id="workspace-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <nav className="workspace-mobile-nav" aria-label="Shift navigation">
        {navigation[0].items.map(({ to, label, shortLabel, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            aria-current={to === currentPath ? "page" : undefined}
          >
            <Icon size={19} aria-hidden="true" />
            {shortLabel ?? label}
          </Link>
        ))}
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => menu.current?.showModal()}
        >
          <Menu size={19} aria-hidden="true" />
          Menu
        </button>
      </nav>

      <dialog
        className="workspace-menu"
        ref={menu}
        aria-labelledby="workspace-menu-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) menu.current?.close();
        }}
      >
        <div className="workspace-menu-content">
          <header>
            <h2 id="workspace-menu-title">Workspace menu</h2>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => menu.current?.close()}
            >
              <X size={22} aria-hidden="true" />
            </button>
          </header>
          <nav aria-label="All pages">{links(() => menu.current?.close())}</nav>
          <Link
            className="workspace-handover"
            to="/supervisor#handover"
            onClick={() => menu.current?.close()}
          >
            <span>Shift handover</span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </dialog>
    </div>
  );
}
