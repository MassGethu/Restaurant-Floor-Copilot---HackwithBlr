import { ArrowUpRight, Clock3, LayoutGrid, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { FloorState } from "../api/copilot";
import { formatSpan } from "../lib/format";

export default function ServiceFloorOverview({
  state,
}: {
  state: FloorState | null;
}) {
  const waiting = state?.parties.filter((p) => p.status === "waiting") ?? [];
  const ready = state?.tables.filter((t) => t.seating_eligible).length ?? 0;
  const label = {
    ready: "Ready to seat",
    occupied: "In service",
    cleaning_required: "Cleaning",
    needs_verification: "Opening check",
  };
  return (
    <section
      className="service-floor-overview"
      aria-label="Live floor overview"
    >
      <div className="service-floor-map">
        <header className="service-section-head">
          <div>
            <span className="section-kicker">THE ROOM AT A GLANCE</span>
            <h2>Your floor, right now.</h2>
          </div>
          <Link to="/floor">
            Open floor <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </header>
        <div className="room-legend">
          <span>
            <i className="ready" />
            {ready} ready
          </span>
          <span>
            <i className="occupied" />
            In service
          </span>
          <span>
            <i className="cleaning_required" />
            Cleaning
          </span>
        </div>
        <div className="room-plan" data-visual="live-floor-state">
          {!state?.tables.length ? (
            <div className="room-empty">
              <LayoutGrid size={28} aria-hidden="true" />
              <p>
                Connect your camera and draw the tables to bring your floor
                online.
              </p>
              <Link to="/setup">
                Set up your floor <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            state.tables.map((table) => {
              const party = state.parties.find((p) => p.id === table.party_id);
              const status = table.blocked
                ? "Unavailable"
                : table.status === "occupied" &&
                    party &&
                    !party.arrival_confirmed
                  ? "Guests on the way"
                  : label[table.status];
              return (
                <Link
                  className={`room-table ${table.blocked ? "blocked" : table.status}`}
                  to="/floor"
                  key={table.id}
                  aria-label={`${table.name}: ${status}, ${table.capacity} seats`}
                >
                  <span className="room-table-furniture" aria-hidden="true">
                    <i />
                    <i />
                    <b>{table.id}</b>
                    <i />
                    <i />
                  </span>
                  <strong>{table.name}</strong>
                  <span className="room-table-status">{status}</span>
                  <small>
                    <Users size={11} aria-hidden="true" />
                    {table.capacity} seats
                  </small>
                </Link>
              );
            })
          )}
        </div>
        <div className="room-foot">
          <span>
            <i />
            {state?.tables.length ?? 0} configured tables
          </span>
          <Link to="/live">
            Inspect camera <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <aside className="service-queue" aria-labelledby="queue-preview-title">
        <header className="service-section-head">
          <div>
            <span className="section-kicker">UP NEXT</span>
            <h2 id="queue-preview-title">
              Waiting list <span>{waiting.length}</span>
            </h2>
          </div>
          <Users size={19} aria-hidden="true" />
        </header>
        <ol>
          {waiting.slice(0, 3).map((party, index) => (
            <li key={party.id}>
              <span className="queue-position">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <strong>{party.name}</strong>
                <span>
                  {party.size} guests <i>·</i>{" "}
                  <Clock3 size={11} aria-hidden="true" />
                  {formatSpan(
                    Math.max(0, (state?.now ?? 0) - party.arrived_at),
                  )}
                </span>
              </div>
            </li>
          ))}
        </ol>
        {!waiting.length && (
          <div className="queue-preview-empty">
            <Users size={28} strokeWidth={1.3} aria-hidden="true" />
            <strong>No one’s waiting.</strong>
            <p>The next party appears here when they check in.</p>
          </div>
        )}
        <Link className="queue-view-link" to="/floor#add-party">
          Manage waiting list <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
        <div className="queue-guest-entry">
          <span>Let guests take it from here.</span>
          <Link to="/welcome">
            Open check-in QR <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </aside>
    </section>
  );
}
