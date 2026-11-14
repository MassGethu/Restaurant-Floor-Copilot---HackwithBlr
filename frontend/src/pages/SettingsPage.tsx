import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { settingsPages } from "../lib/workspaceNavigation";

const groups = ["Restaurant", "Camera", "Planning tools"] as const;

export default function SettingsPage() {
  return (
    <div className="settings-page">
      <header className="page-title">
        <div>
          <h1>Settings</h1>
          <p>Set things up once. You won’t need these during service.</p>
        </div>
      </header>
      {groups.map((group) => (
        <section key={group} className="settings-group">
          <h2>{group}</h2>
          <div className="settings-grid">
            {settingsPages
              .filter((page) => page.group === group)
              .map(({ to, label, description, icon: Icon }) => (
                <Link key={to} to={to} className="settings-card">
                  <span className="settings-icon">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
