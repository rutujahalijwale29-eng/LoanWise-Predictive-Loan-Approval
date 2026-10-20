import { useCallback, useEffect, useMemo, useState } from "react";
import "./AdminDashboard.css";

const API_BASE = "http://127.0.0.1:8000";

async function getJson(path, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || `Request failed (${response.status})`);
  }

  return data;
}

function asList(data, keys = []) {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return [];
}

function firstValue(obj, keys, fallback = "—") {
  for (const key of keys) {
    const value = obj?.[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function numberValue(obj, keys) {
  const value = firstValue(obj, keys, 0);
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function prettyDate(value) {
  if (!value || value === "—") return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}


function predictionLabel(row) {
  const raw = String(
    firstValue(
      row,
      ["prediction", "status", "loan_status", "result", "predicted_status"],
      "Pending"
    )
  ).trim().toLowerCase();

  if (["1", "y", "yes", "approved", "approve", "accepted"].includes(raw)) {
    return "Approved";
  }

  if (["0", "n", "no", "rejected", "reject", "denied", "not approved"].includes(raw)) {
    return "Rejected";
  }

  return raw === "pending"
    ? "Pending"
    : raw.charAt(0).toUpperCase() + raw.slice(1);
}


function StatusBadge({ value }) {
  const label =
    typeof value === "string"
      ? value
      : predictionLabel(value || {});

  const normalized = label.toLowerCase();

  const className = normalized.includes("approv")
    ? "approved"
    : normalized.includes("reject") ||
        normalized.includes("denied")
      ? "rejected"
      : normalized === "active" ||
          normalized === "connected"
        ? "active"
        : normalized === "inactive" ||
            normalized === "unavailable"
          ? "inactive"
          : "pending";

  return <span className={`lw-status ${className}`}>{label}</span>;
}

function NavIcon({ children }) {
  return (
    <span className="lw-nav-icon" aria-hidden="true">
      {children}
    </span>
  );
}

export default function AdminDashboard({
  user,
  token,
  onLogout,
  onGoToPrediction,
}) {
  const [activePage, setActivePage] = useState("Dashboard");
  const [stats, setStats] = useState({});
  const [users, setUsers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search, setSearch] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!token) {
      setError(
        "Your login session is missing. Please log out and sign in again."
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [statsResponse, usersResponse, applicationsResponse] =
        await Promise.all([
          getJson("/admin/stats", token),
          getJson("/admin/users?limit=100", token),
          getJson("/admin/applications?limit=100", token),
        ]);

      setStats(statsResponse || {});

      setUsers(
        asList(usersResponse, ["users", "items", "results", "data"])
      );

      setApplications(
        asList(applicationsResponse, [
          "applications",
          "items",
          "results",
          "data",
        ])
      );

      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const totalUsers =
    numberValue(stats, [
      "total_users",
      "users_count",
      "registered_users",
      "totalUsers",
    ]) || users.length;

  const totalApplications =
    numberValue(stats, [
      "total_applications",
      "applications_count",
      "totalApplications",
    ]) || applications.length;

  const approvedCount =
    numberValue(stats, [
      "approved",
      "approved_applications",
      "approved_count",
      "total_approved",
      "approvedApplications",
    ]) ||
    applications.filter(
      (row) => predictionLabel(row) === "Approved"
    ).length;

  const rejectedCount =
    numberValue(stats, [
      "rejected",
      "rejected_applications",
      "rejected_count",
      "total_rejected",
      "rejectedApplications",
    ]) ||
    applications.filter(
      (row) => predictionLabel(row) === "Rejected"
    ).length;

  const filteredApplications = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return applications;

    return applications.filter((row) =>
      [
        firstValue(
          row,
          ["full_name", "user_name", "applicant_name", "name"],
          ""
        ),
        firstValue(row, ["email", "user_email"], ""),
        firstValue(row, ["id", "application_id"], ""),
        predictionLabel(row),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [applications, search]);

  const navGroups = [
    {
      title: "MAIN MENU",
      items: [{ label: "Dashboard", icon: "▦" }],
    },
    {
      title: "LOAN MANAGEMENT",
      items: [
        { label: "All Applications", icon: "▤" },
        { label: "All Predictions", icon: "◉" },
        { label: "Registered Users", icon: "♙" },
        { label: "Reports & Analytics", icon: "▥" },
      ],
    },
  ];

  const shownApplications =
    activePage === "All Predictions"
      ? filteredApplications.filter(
          (row) => predictionLabel(row) !== "Pending"
        )
      : filteredApplications;

  const renderApplicationsTable = (rows) => (
    <div className="lw-table-wrap">
      <table className="lw-table">
        <thead>
          <tr>
            <th>APPLICATION ID</th>
            <th>APPLICANT</th>
            <th>EMAIL</th>
            <th>LOAN AMOUNT</th>
            <th>DATE SUBMITTED</th>
            <th>STATUS</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="6" className="lw-empty">
                No applications found yet.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={firstValue(
                  row,
                  ["id", "application_id"],
                  index
                )}
              >
                <td className="lw-id">
                  #
                  {firstValue(
                    row,
                    ["id", "application_id"],
                    index + 1
                  )}
                </td>

                <td>
                  <div className="lw-applicant">
                    <span className="lw-avatar">
                      {String(
                        firstValue(
                          row,
                          [
                            "full_name",
                            "user_name",
                            "applicant_name",
                            "name",
                          ],
                          "A"
                        )
                      )
                        .slice(0, 1)
                        .toUpperCase()}
                    </span>

                    <span>
                      {firstValue(
                        row,
                        [
                          "full_name",
                          "user_name",
                          "applicant_name",
                          "name",
                        ],
                        "Applicant"
                      )}
                    </span>
                  </div>
                </td>

                <td>
                  {firstValue(row, ["email", "user_email"], "—")}
                </td>

                <td>
                  {(() => {
                    const amount = firstValue(
                      row,
                      ["loan_amount", "LoanAmount", "amount"],
                      "—"
                    );

                    return amount === "—"
                      ? amount
                      : `₹${Number(amount).toLocaleString("en-IN")}`;
                  })()}
                </td>

                <td>
                  {prettyDate(
                    firstValue(
                      row,
                      ["created_at", "application_date", "date"],
                      "—"
                    )
                  )}
                </td>

                <td>
                  <StatusBadge value={predictionLabel(row)} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const renderUsersTable = () => (
    <div className="lw-table-wrap">
      <table className="lw-table">
        <thead>
          <tr>
            <th>USER</th>
            <th>EMAIL ADDRESS</th>
            <th>ROLE</th>
            <th>JOINED DATE</th>
            <th>ACCOUNT STATUS</th>
          </tr>
        </thead>

        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan="5" className="lw-empty">
                No registered users found.
              </td>
            </tr>
          ) : (
            users.map((item, index) => (
              <tr
                key={firstValue(item, ["id", "email"], index)}
              >
                <td>
                  <div className="lw-applicant">
                    <span className="lw-avatar">
                      {String(
                        firstValue(item, ["full_name", "name"], "U")
                      )
                        .slice(0, 1)
                        .toUpperCase()}
                    </span>

                    <span>
                      {firstValue(
                        item,
                        ["full_name", "name"],
                        "User"
                      )}
                    </span>
                  </div>
                </td>

                <td>{firstValue(item, ["email"], "—")}</td>

                <td>
                  <span
                    className={`lw-role ${String(
                      firstValue(item, ["role"], "user")
                    ).toLowerCase()}`}
                  >
                    {firstValue(item, ["role"], "user")}
                  </span>
                </td>

                <td>
                  {prettyDate(
                    firstValue(
                      item,
                      ["created_at", "joined_at"],
                      "—"
                    )
                  )}
                </td>

                <td>
                  <StatusBadge
                    value={
                      item.is_active === false
                        ? "Inactive"
                        : "Active"
                    }
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const pageIntro = {
    Dashboard: [
      "Dashboard Overview",
      "Here's what's happening with your loan prediction system today.",
    ],
    "All Applications": [
      "All Loan Applications",
      "Review and track the applications submitted by users.",
    ],
    "All Predictions": [
      "Loan Predictions",
      "Browse applications with an approved or rejected prediction.",
    ],
    "Registered Users": [
      "Registered Users",
      "View the accounts registered in LoanWise.",
    ],
    "Reports & Analytics": [
      "Reports & Analytics",
      "A summary of loan application and prediction activity.",
    ],
  }[activePage] || [activePage, "Manage your LoanWise workspace."];

  return (
    <div className="lw-admin-shell">
      <aside className="lw-sidebar">
        <div className="lw-brand">
          <span className="lw-brand-mark">L</span>

          <span className="lw-brand-name">
            LoanWise
            <span>ADMIN PORTAL</span>
          </span>
        </div>

        <div className="lw-profile">
          <div className="lw-profile-avatar">
            {String(user?.full_name || user?.name || "A")
              .slice(0, 1)
              .toUpperCase()}
          </div>

          <div className="lw-profile-copy">
            <strong>
              {user?.full_name || user?.name || "Administrator"}
            </strong>
            <span>
              <i /> System Administrator
            </span>
          </div>
        </div>

        <nav className="lw-nav">
          {navGroups.map((group) => (
            <div className="lw-nav-group" key={group.title}>
              <div className="lw-nav-heading">{group.title}</div>

              {group.items.map((item) => (
                <button
                  key={item.label}
                  className={`lw-nav-link ${
                    activePage === item.label ? "active" : ""
                  }`}
                  onClick={() => setActivePage(item.label)}
                >
                  <NavIcon>{item.icon}</NavIcon>
                  <span>{item.label}</span>

                  {item.label === "All Applications" &&
                    applications.length > 0 && (
                      <small>{applications.length}</small>
                    )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="lw-sidebar-bottom">
          <div className="lw-help-card">
            <span className="lw-help-icon">?</span>
            <strong>Need help?</strong>
            <p>
              Check your LoanWise dashboard data and system status.
            </p>

            <button onClick={loadDashboard}>
              Refresh data <span>↗</span>
            </button>
          </div>

          <button
            className="lw-sidebar-action"
            onClick={onGoToPrediction}
          >
            <NavIcon>＋</NavIcon> New prediction
          </button>

          <button
            className="lw-sidebar-action logout"
            onClick={onLogout}
          >
            <NavIcon>↪</NavIcon> Sign out
          </button>
        </div>
      </aside>

      <main className="lw-main">
        <header className="lw-topbar">
          <div className="lw-breadcrumb">
            <span>LoanWise</span>
            <b>/</b>
            <strong>{activePage}</strong>
          </div>

          <div className="lw-top-actions">
            <span className="lw-system-status">
              <i /> System online
            </span>

            <button
              className="lw-icon-button"
              title="Refresh dashboard"
              onClick={loadDashboard}
            >
              ⟳
            </button>

            <div className="lw-top-user">
              <div className="lw-top-avatar">
                {String(user?.full_name || user?.name || "A")
                  .slice(0, 1)
                  .toUpperCase()}
              </div>

              <div>
                <strong>
                  {user?.full_name || user?.name || "Admin"}
                </strong>
                <span>Administrator</span>
              </div>

              <span className="lw-chevron">⌄</span>
            </div>
          </div>
        </header>

        <div className="lw-page-content">
          <div className="lw-page-heading">
            <div>
              <div className="lw-eyebrow">
                LOANWISE CONTROL CENTER
              </div>

              <h1>{pageIntro[0]}</h1>
              <p>{pageIntro[1]}</p>
            </div>

            <div className="lw-heading-right">
              <span className="lw-date-chip">
                ▦{" "}
                {new Date().toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>

              <button
                className="lw-primary-button"
                onClick={onGoToPrediction}
              >
                <span>＋</span> New prediction
              </button>
            </div>
          </div>

          {error && (
            <div className="lw-error">
              <strong>Could not load live data.</strong>
              <span>{error}</span>
              <button onClick={loadDashboard}>Try again</button>
            </div>
          )}

          {loading && (
            <div className="lw-loading">
              <span className="lw-spinner" />
              Loading dashboard data…
            </div>
          )}

          {activePage === "Dashboard" && (
            <>
              <div className="lw-stats-grid">
                <article className="lw-stat-card">
                  <div className="lw-stat-top">
                    <span>Total Applications</span>
                    <span className="lw-stat-icon blue">▤</span>
                  </div>
                  <div className="lw-stat-number">
                    {totalApplications.toLocaleString("en-IN")}
                  </div>
                  <div className="lw-stat-foot">
                    <span className="lw-stat-dot blue-dot" />
                    All loan submissions
                  </div>
                  <div className="lw-stat-watermark">▤</div>
                </article>

                <article className="lw-stat-card">
                  <div className="lw-stat-top">
                    <span>Approved Loans</span>
                    <span className="lw-stat-icon green">✓</span>
                  </div>
                  <div className="lw-stat-number">
                    {approvedCount.toLocaleString("en-IN")}
                  </div>
                  <div className="lw-stat-foot">
                    <span className="lw-stat-dot green-dot" />
                    Prediction approved
                  </div>
                  <div className="lw-stat-watermark">✓</div>
                </article>

                <article className="lw-stat-card">
                  <div className="lw-stat-top">
                    <span>Rejected Loans</span>
                    <span className="lw-stat-icon red">×</span>
                  </div>
                  <div className="lw-stat-number">
                    {rejectedCount.toLocaleString("en-IN")}
                  </div>
                  <div className="lw-stat-foot">
                    <span className="lw-stat-dot red-dot" />
                    Prediction rejected
                  </div>
                  <div className="lw-stat-watermark">×</div>
                </article>

                <article className="lw-stat-card">
                  <div className="lw-stat-top">
                    <span>Registered Users</span>
                    <span className="lw-stat-icon violet">♙</span>
                  </div>
                  <div className="lw-stat-number">
                    {totalUsers.toLocaleString("en-IN")}
                  </div>
                  <div className="lw-stat-foot">
                    <span className="lw-stat-dot violet-dot" />
                    Active user accounts
                  </div>
                  <div className="lw-stat-watermark">♙</div>
                </article>
              </div>

              <div className="lw-overview-grid">
                <section className="lw-panel lw-distribution-panel">
                  <div className="lw-panel-heading">
                    <div>
                      <h2>Prediction Overview</h2>
                      <p>Approval distribution across all applications</p>
                    </div>
                    <span className="lw-panel-menu">•••</span>
                  </div>

                  <div className="lw-donut-row">
                    <div
                      className="lw-donut"
                      style={{
                        "--approved": `${
                          totalApplications
                            ? (approvedCount / totalApplications) * 100
                            : 0
                        }%`,
                        "--rejected": `${
                          totalApplications
                            ? (rejectedCount / totalApplications) * 100
                            : 0
                        }%`,
                      }}
                    >
                      <div className="lw-donut-center">
                        <strong>{totalApplications}</strong>
                        <span>Applications</span>
                      </div>
                    </div>

                    <div className="lw-legend">
                      <div>
                        <span className="lw-legend-dot approved-dot" />
                        <div>
                          <strong>Approved</strong>
                          <span>{approvedCount} applications</span>
                        </div>
                        <b>
                          {totalApplications
                            ? Math.round(
                                (approvedCount / totalApplications) * 100
                              )
                            : 0}
                          %
                        </b>
                      </div>

                      <div>
                        <span className="lw-legend-dot rejected-dot" />
                        <div>
                          <strong>Rejected</strong>
                          <span>{rejectedCount} applications</span>
                        </div>
                        <b>
                          {totalApplications
                            ? Math.round(
                                (rejectedCount / totalApplications) * 100
                              )
                            : 0}
                          %
                        </b>
                      </div>

                      <div>
                        <span className="lw-legend-dot pending-dot" />
                        <div>
                          <strong>Pending / Other</strong>
                          <span>
                            {Math.max(
                              0,
                              totalApplications -
                                approvedCount -
                                rejectedCount
                            )}{" "}
                            applications
                          </span>
                        </div>
                        <b>
                          {totalApplications
                            ? Math.round(
                                (Math.max(
                                  0,
                                  totalApplications -
                                    approvedCount -
                                    rejectedCount
                                ) /
                                  totalApplications) *
                                  100
                              )
                            : 0}
                          %
                        </b>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="lw-panel lw-quick-panel">
                  <div className="lw-panel-heading">
                    <div>
                      <h2>Quick Actions</h2>
                      <p>Common administration tasks</p>
                    </div>
                  </div>

                  <button
                    className="lw-quick-action"
                    onClick={() => setActivePage("All Applications")}
                  >
                    <span className="lw-quick-icon blue">▤</span>
                    <span>
                      <strong>View applications</strong>
                      <small>Review submitted loan requests</small>
                    </span>
                    <b>›</b>
                  </button>

                  <button
                    className="lw-quick-action"
                    onClick={() => setActivePage("Registered Users")}
                  >
                    <span className="lw-quick-icon violet">♙</span>
                    <span>
                      <strong>Manage users</strong>
                      <small>Browse registered accounts</small>
                    </span>
                    <b>›</b>
                  </button>

                  <button
                    className="lw-quick-action"
                    onClick={() => setActivePage("Reports & Analytics")}
                  >
                    <span className="lw-quick-icon green">▥</span>
                    <span>
                      <strong>View reports</strong>
                      <small>Explore prediction summary</small>
                    </span>
                    <b>›</b>
                  </button>
                </section>
              </div>

              <section className="lw-panel lw-recent-panel">
                <div className="lw-panel-heading">
                  <div>
                    <h2>Recent Loan Applications</h2>
                    <p>Latest applications received by LoanWise</p>
                  </div>

                  <button
                    className="lw-text-button"
                    onClick={() => setActivePage("All Applications")}
                  >
                    View all applications <span>→</span>
                  </button>
                </div>

                {renderApplicationsTable(applications.slice(0, 6))}
              </section>
            </>
          )}

          {(activePage === "All Applications" ||
            activePage === "All Predictions") && (
            <section className="lw-panel lw-list-panel">
              <div className="lw-panel-heading list-heading">
                <div>
                  <h2>{activePage}</h2>
                  <p>
                    {shownApplications.length} record
                    {shownApplications.length === 1 ? "" : "s"} available
                  </p>
                </div>

                <div className="lw-table-tools">
                  <label className="lw-search">
                    <span>⌕</span>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search applicants…"
                    />
                  </label>

                  <button
                    className="lw-outline-button"
                    onClick={loadDashboard}
                  >
                    ⟳ Refresh
                  </button>
                </div>
              </div>

              {renderApplicationsTable(shownApplications)}
            </section>
          )}

          {activePage === "Registered Users" && (
            <section className="lw-panel lw-list-panel">
              <div className="lw-panel-heading list-heading">
                <div>
                  <h2>Registered Users</h2>
                  <p>
                    {users.length} account
                    {users.length === 1 ? "" : "s"} in LoanWise
                  </p>
                </div>

                <button
                  className="lw-outline-button"
                  onClick={loadDashboard}
                >
                  ⟳ Refresh users
                </button>
              </div>

              {renderUsersTable()}
            </section>
          )}

          {activePage === "Reports & Analytics" && (
            <div className="lw-report-grid">
              <section className="lw-panel">
                <div className="lw-panel-heading">
                  <div>
                    <h2>Loan Prediction Summary</h2>
                    <p>
                      Current totals based on available application records
                    </p>
                  </div>
                </div>

                <div className="lw-report-rows">
                  <div>
                    <span>Total applications</span>
                    <strong>{totalApplications}</strong>
                    <div className="lw-progress">
                      <i style={{ width: "100%" }} />
                    </div>
                  </div>

                  <div>
                    <span>Approved</span>
                    <strong>{approvedCount}</strong>
                    <div className="lw-progress green">
                      <i
                        style={{
                          width: `${
                            totalApplications
                              ? (approvedCount / totalApplications) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <span>Rejected</span>
                    <strong>{rejectedCount}</strong>
                    <div className="lw-progress red">
                      <i
                        style={{
                          width: `${
                            totalApplications
                              ? (rejectedCount / totalApplications) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <span>Registered users</span>
                    <strong>{totalUsers}</strong>
                    <div className="lw-progress violet">
                      <i
                        style={{
                          width: `${Math.min(totalUsers, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="lw-panel">
                <div className="lw-panel-heading">
                  <div>
                    <h2>System Summary</h2>
                    <p>Current dashboard data status</p>
                  </div>
                </div>

                <div className="lw-system-list">
                  <div>
                    <span>API connection</span>
                    <StatusBadge
                      value={
                        error
                          ? "Unavailable"
                          : loading
                            ? "Loading"
                            : "Connected"
                      }
                    />
                  </div>

                  <div>
                    <span>Last refreshed</span>
                    <strong>
                      {lastUpdated
                        ? lastUpdated.toLocaleTimeString()
                        : "Not refreshed"}
                    </strong>
                  </div>

                  <div>
                    <span>Application records loaded</span>
                    <strong>{applications.length}</strong>
                  </div>

                  <div>
                    <span>User records loaded</span>
                    <strong>{users.length}</strong>
                  </div>
                </div>

                <button
                  className="lw-primary-button lw-full-button"
                  onClick={loadDashboard}
                >
                  Refresh report data
                </button>
              </section>
            </div>
          )}

          <footer className="lw-footer">
            <span>
              © {new Date().getFullYear()} <strong>LoanWise</strong>. Predict
              smarter. Decide better.
            </span>

            <span>
              Secure Admin Portal <i />
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}