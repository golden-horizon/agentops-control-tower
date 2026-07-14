import { useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  Activity,
  MoreVertical,
  ServerCog,
  ShieldAlert,
  TowerControl,
  UserRound,
  X
} from "lucide-react";

function displayValue(value, fallback = "Not specified") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

function formatDate(value) {
  if (!value) {
    return "Not specified";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatActivityTime(value) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatActionLabel(action) {
  if (action === "AGENT_DISABLED") {
    return "Agent disabled";
  }

  if (action === "AGENT_ENABLED") {
    return "Agent enabled";
  }

  return "Status changed";
}

async function fetchActivityLogs() {
  const response = await fetch("http://localhost:5000/api/activity-logs");

  if (!response.ok) {
    throw new Error("Could not load activity logs");
  }

  return response.json();
}

async function fetchAgentPolicy(agentId) {
  const response = await fetch(
    `http://localhost:5000/api/agents/${agentId}/policy`
  );

  if (!response.ok) {
    throw new Error("Could not load agent policy");
  }

  return response.json();
}

function createPolicyForm(policy) {
  return {
    policy_name: policy?.policy_name ?? "",
    enforcement_status: policy?.enforcement_status ?? "draft",
    requires_approval: policy?.requires_approval ?? false,
    max_actions_per_hour: policy?.max_actions_per_hour ?? 0,
    risk_threshold: policy?.risk_threshold ?? 0,
    allowed_actions: policy?.allowed_actions?.join(", ") ?? "",
    blocked_actions: policy?.blocked_actions?.join(", ") ?? ""
  };
}

function parseActionList(value) {
  return value
    .split(",")
    .map((action) => action.trim())
    .filter(Boolean);
}

function formatRequestType(value) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatApprovalPayload(payload) {
  if (payload?.ip && payload?.reason) {
    return (
      <>
        <span>IP: {payload.ip}</span>
        <span>Reason: {payload.reason}</span>
      </>
    );
  }

  return <span>{JSON.stringify(payload)}</span>;
}

async function fetchApprovalRequests(filter) {
  const url =
    filter === "all"
      ? "http://localhost:5000/api/approval-requests"
      : `http://localhost:5000/api/approval-requests?status=${filter}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Could not load approval requests");
  }

  return response.json();
}

function App() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [isEditingPolicy, setIsEditingPolicy] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    policy_name: "",
    enforcement_status: "draft",
    requires_approval: false,
    max_actions_per_hour: 0,
    risk_threshold: 0,
    allowed_actions: "",
    blocked_actions: ""
  });
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsError, setApprovalsError] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [reviewingApprovalId, setReviewingApprovalId] = useState(null);

  useEffect(() => {
    async function loadAgents() {
      try {
        const response = await fetch("http://localhost:5000/api/agents");

        if (!response.ok) {
          throw new Error("Could not load agents");
        }

        const data = await response.json();
        setAgents(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    async function loadActivityLogs() {
      try {
        const logs = await fetchActivityLogs();
        setActivityLogs(logs);
      } catch (err) {
        console.error(err);
      }
    }

    loadAgents();
    loadActivityLogs();
  }, []);

  useEffect(() => {
    if (activeView !== "approvals") {
      return;
    }

    async function loadApprovals() {
      setApprovalsLoading(true);
      setApprovalsError("");

      try {
        const requests = await fetchApprovalRequests(approvalFilter);
        setApprovalRequests(requests);
      } catch (err) {
        console.error(err);
        setApprovalsError("Could not load approval requests.");
      } finally {
        setApprovalsLoading(false);
      }
    }

    loadApprovals();
  }, [activeView, approvalFilter]);

  const metrics = useMemo(() => {
    return {
      total: agents.length,
      connected: agents.filter(
        (agent) => agent.integration_status === "connected"
      ).length,
      highRisk: agents.filter(
        (agent) => agent.risk_score >= 70
      ).length,
      disabled: agents.filter(
        (agent) => agent.status === "disabled"
      ).length
    };
  }, [agents]);

  const approvalSummary = useMemo(() => {
    return {
      total: approvalRequests.length,
      pending: approvalRequests.filter((request) => request.status === "pending")
        .length,
      approved: approvalRequests.filter((request) => request.status === "approved")
        .length,
      rejected: approvalRequests.filter((request) => request.status === "rejected")
        .length
    };
  }, [approvalRequests]);

  const updateAgentStatus = async (
    agentId,
    status
  ) => {
    try {
      const response = await fetch(
        `http://localhost:5000/api/agents/${agentId}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ status })
        }
      );

      if (!response.ok) {
        throw new Error(
          "Failed to update agent"
        );
      }

      const updatedAgent =
        await response.json();

      setAgents((previous) =>
        previous.map((agent) =>
          agent.id === updatedAgent.id
            ? updatedAgent
            : agent
        )
      );

      setSelectedAgent((current) =>
        current?.id === updatedAgent.id
          ? updatedAgent
          : current
      );

      const logs = await fetchActivityLogs();
      setActivityLogs(logs);
    } catch (error) {
      console.error(error);
    }
  };

  const openAgentDetails = async (agent) => {
    setSelectedAgent(agent);
    setOpenMenuId(null);
    setPolicyLoading(true);
    setPolicyError("");
    setSelectedPolicy(null);
    setIsEditingPolicy(false);

    try {
      const policy = await fetchAgentPolicy(agent.id);
      setSelectedPolicy(policy);
      setPolicyForm(createPolicyForm(policy));
    } catch (error) {
      console.error(error);
      setPolicyError("Could not load policy details.");
    } finally {
      setPolicyLoading(false);
    }
  };

  const handlePolicyFormChange = (field, value) => {
    setPolicyForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const startPolicyEdit = () => {
    if (!selectedPolicy) {
      return;
    }

    setPolicyError("");
    setPolicyForm(createPolicyForm(selectedPolicy));
    setIsEditingPolicy(true);
  };

  const cancelPolicyEdit = () => {
    setIsEditingPolicy(false);
    setPolicyError("");
    setPolicyForm(createPolicyForm(selectedPolicy));
  };

  const savePolicy = async () => {
    if (!selectedAgent) {
      return;
    }

    setPolicySaving(true);
    setPolicyError("");

    try {
      const response = await fetch(
        `http://localhost:5000/api/agents/${selectedAgent.id}/policy`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            policy_name: policyForm.policy_name,
            enforcement_status: policyForm.enforcement_status,
            requires_approval: policyForm.requires_approval,
            max_actions_per_hour: Number(policyForm.max_actions_per_hour),
            risk_threshold: Number(policyForm.risk_threshold),
            allowed_actions: parseActionList(policyForm.allowed_actions),
            blocked_actions: parseActionList(policyForm.blocked_actions)
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        throw new Error(
          errorData.details ||
          errorData.error ||
          "Failed to update policy"
        );
      }

      const updatedPolicy = await response.json();
      setSelectedPolicy(updatedPolicy);
      setPolicyForm(createPolicyForm(updatedPolicy));
      setIsEditingPolicy(false);

      const logs = await fetchActivityLogs();
      setActivityLogs(logs);
    } catch (error) {
      console.error(error);
      setPolicyError(error.message || "Could not save policy.");
    } finally {
      setPolicySaving(false);
    }
  };

  const refreshApprovals = async () => {
    const requests = await fetchApprovalRequests(approvalFilter);
    setApprovalRequests(requests);
  };

  const handleApprovalDecision = async (requestId, decision) => {
    setReviewingApprovalId(requestId);
    setApprovalsError("");

    try {
      const response = await fetch(
        `http://localhost:5000/api/approval-requests/${requestId}/decision`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            decision,
            reviewed_by: "Navid",
            review_note:
              decision === "approved"
                ? "Approved in AgentOps Control Center"
                : "Rejected in AgentOps Control Center"
          })
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));

        throw new Error(errorBody.error || "Failed to review approval request");
      }

      await refreshApprovals();

      const logs = await fetchActivityLogs();
      setActivityLogs(logs);
    } catch (error) {
      console.error(error);
      setApprovalsError(error.message || "Could not review approval request.");
    } finally {
      setReviewingApprovalId(null);
    }
  };

  return (
    <>
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand">
           <div className="brand-mark" aria-hidden="true">
                  <TowerControl size={34} strokeWidth={2.5} />
           </div>

          <div className="brand-copy">
          <h2>AgentOps</h2>
          <span>Control Center</span>
      </div>
    </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeView === "overview" ? "active" : ""}`}
            onClick={() => setActiveView("overview")}
          >
            Overview
          </button>
          <button className="nav-item">Agents</button>
          <button className="nav-item">Activity</button>
          <button className="nav-item">Policies</button>
          <button
            className={`nav-item ${activeView === "approvals" ? "active" : ""}`}
            onClick={() => setActiveView("approvals")}
          >
            Approvals
          </button>
          <button className="nav-item">Audit Logs</button>
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item">Settings</button>

          <div className="system-status">
            <span className="status-dot"></span>
            Platform operational
          </div>
        </div>
      </aside>

      <main className="content">
        {activeView === "overview" ? (
        <>
        <header className="topbar">
          <div>
            <p className="eyebrow">Enterprise AI Operations</p>
            <h1>Command Centre</h1>
            <p className="subtitle">
              Monitor, govern and control organisational AI agents.
            </p>
          </div>

          <div className="topbar-actions">
            <div className="search-box">
              <input type="text" placeholder="Search agents..." />
            </div>

            <div className="profile">
              <div className="profile-avatar">NG</div>

              <div>
                <strong>Navid</strong>
                <span>Administrator</span>
              </div>
            </div>
          </div>
        </header>

        <section className="kpi-grid">
          <article className="kpi-card">
            <span className="kpi-label">Registered agents</span>
            <strong className="kpi-value">{metrics.total}</strong>
            <span className="kpi-note">Across the organisation</span>
          </article>

          <article className="kpi-card">
            <span className="kpi-label">Live integrations</span>
            <strong className="kpi-value">{metrics.connected}</strong>
            <span className="kpi-note positive">Connected runtime</span>
          </article>

          <article className="kpi-card">
            <span className="kpi-label">High-risk agents</span>
            <strong className="kpi-value">{metrics.highRisk}</strong>
            <span className="kpi-note warning">Requires monitoring</span>
          </article>

          <article className="kpi-card">
            <span className="kpi-label">Disabled agents</span>
            <strong className="kpi-value">{metrics.disabled}</strong>
            <span className="kpi-note danger">Execution blocked</span>
          </article>
        </section>

        <section className="overview-grid">
          <article className="panel operations-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Live topology</p>
                <h2>Agent Operations Map</h2>
              </div>

              <span className="live-badge">Live</span>
            </div>

            <div className="operations-map">
              <div className="tower-node">
                <span>Control Tower</span>
                <small>Policy and governance layer</small>
              </div>

              <div className="connector-line"></div>

              <div className="agent-node-grid">
                {agents.slice(0, 4).map((agent) => (
                  <div className="agent-node" key={agent.id}>
                    <span
                         className={`node-dot ${
                         agent.status === "disabled"
                         ? "disabled"
                         : agent.integration_status === "connected"
                         ? "connected"
                         : agent.integration_status === "demo"
                         ? "demo"
                         : "offline"
                         }`}
                    ></span>

                    <div>
                      <strong>{agent.name}</strong>
                      <small>
                          {agent.integration_status === "connected"
                          ? "Live runtime"
                          : agent.integration_status === "demo"
                          ? "Demo agent"
                           : agent.integration_status}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="panel risk-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Governance</p>
                <h2>Risk Overview</h2>
              </div>
            </div>

            <div className="risk-score">
              <span>Highest risk</span>
              <strong>
                {Math.max(...agents.map((agent) => agent.risk_score), 0)}
              </strong>
              <small>out of 100</small>
            </div>

            <div className="risk-breakdown">
              <div>
                <span>Critical controls</span>
                <strong>Enabled</strong>
              </div>

              <div>
                <span>Policy coverage</span>
                <strong>80%</strong>
              </div>

              <div>
                <span>Pending approvals</span>
                <strong>1</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="panel inventory-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Inventory</p>
              <h2>Registered Agents</h2>
            </div>

            <button className="primary-button">Register Agent</button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Department</th>
                  <th>Runtime</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th className="actions-heading">Actions</th>
                </tr>
              </thead>

              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <div className="agent-cell">
                        <div className="agent-icon">
                          {agent.name.charAt(0)}
                        </div>

                        <div>
                          <strong>{agent.name}</strong>
                          <span>{agent.agent_id}</span>
                        </div>
                      </div>
                    </td>

                    <td>{agent.owner_team}</td>

                    <td>
                      <span
                        className={`runtime-badge ${agent.integration_status}`}
                      >
                        {agent.integration_status}
                      </span>
                    </td>

                    <td>
                      <div className="risk-cell">
                        <span>{agent.risk_score}</span>

                        <div className="risk-bar">
                          <div
                            className="risk-bar-fill"
                            style={{ width: `${agent.risk_score}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className={`agent-status ${agent.status}`}>
                        {agent.status}
                      </span>
                    </td>

                    <td className="actions-cell">
                     <div className="actions-menu-wrapper">
                        <button
                          className="agent-actions-button"
                          type="button"
                          aria-label={`Open actions for ${agent.name}`}
                          aria-expanded={openMenuId === agent.id}
                          onClick={() =>
                          setOpenMenuId(openMenuId === agent.id ? null : agent.id)
                          }
                        >
                        <MoreVertical size={19} strokeWidth={2} />
                       </button>

                       {openMenuId === agent.id && (
                          <div className="agent-actions-menu">
                            <button
                              type="button"
                              onClick={() => {
                                openAgentDetails(agent);
                              }}
                            >
                              View details
                            </button>
                             <button type="button">Edit agent</button>

                             {agent.status === "disabled" ? (
                            <button
                              type="button"
                              className="enable-action"
                              onClick={() => {
                                updateAgentStatus(agent.id, "active");
                                setOpenMenuId(null);
                              }}
                            >
                                 Enable agent
                           </button>
                             ) : (
                           <>
                            <button type="button" className="pause-action">
                            Pause agent
                            </button>

                            <button
                              type="button"
                              className="disable-action"
                              onClick={() => {
                                updateAgentStatus(agent.id, "disabled");
                                setOpenMenuId(null);
                              }}
                            >
                                 Disable agent
                             </button>
                           </>
                            )}
                          </div>
                            )}
                          </div>
                     </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel activity-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Audit Trail</p>
              <h2>Recent Control Activity</h2>
            </div>
          </div>

          {activityLogs.length === 0 ? (
            <div className="empty-activity">
              No control activity recorded yet.
            </div>
          ) : (
            <div className="activity-table-wrapper">
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Agent</th>
                    <th>Action</th>
                    <th>Status Change</th>
                    <th>Performed By</th>
                  </tr>
                </thead>

                <tbody>
                  {activityLogs.slice(0, 8).map((log) => (
                    <tr key={log.id}>
                      <td>{formatActivityTime(log.created_at)}</td>
                      <td>
                        <div className="activity-agent">
                          <strong>{log.agent_name}</strong>
                          <span>{log.agent_external_id}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`activity-action ${log.action}`}>
                          {formatActionLabel(log.action)}
                        </span>
                      </td>
                      <td>
                        <span className="status-change">
                          {log.previous_status} &rarr; {log.new_status}
                        </span>
                      </td>
                      <td>{log.performed_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </>
        ) : (
        <section className="approvals-page">
          <header className="topbar approvals-topbar">
            <div>
              <p className="eyebrow">Human Review</p>
              <h1>Approval Queue</h1>
              <p className="subtitle">
                Human review for agent-requested actions
              </p>
            </div>
          </header>

          <section className="approval-summary-grid">
            <article className="approval-summary-card">
              <span>Total Requests</span>
              <strong>{approvalSummary.total}</strong>
            </article>

            <article className="approval-summary-card pending">
              <span>Pending</span>
              <strong>{approvalSummary.pending}</strong>
            </article>

            <article className="approval-summary-card approved">
              <span>Approved</span>
              <strong>{approvalSummary.approved}</strong>
            </article>

            <article className="approval-summary-card rejected">
              <span>Rejected</span>
              <strong>{approvalSummary.rejected}</strong>
            </article>
          </section>

          <section className="panel approvals-panel">
            <div className="panel-header approvals-panel-header">
              <div>
                <p className="panel-kicker">Decision Queue</p>
                <h2>Requests</h2>
              </div>

              <div className="approval-filter-group">
                {["all", "pending", "approved", "rejected"].map((filter) => (
                  <button
                    type="button"
                    className={approvalFilter === filter ? "active" : ""}
                    key={filter}
                    onClick={() => setApprovalFilter(filter)}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {approvalsError && (
              <div className="approvals-message error">
                {approvalsError}
              </div>
            )}

            {approvalsLoading ? (
              <div className="approvals-message">
                Loading approval requests...
              </div>
            ) : approvalRequests.length === 0 ? (
              <div className="approvals-message">
                No approval requests found.
              </div>
            ) : (
              <div className="approvals-table-wrapper">
                <table className="approvals-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Request Type</th>
                      <th>Payload</th>
                      <th>Status</th>
                      <th>Requested By</th>
                      <th>Created</th>
                      <th>Review</th>
                    </tr>
                  </thead>

                  <tbody>
                    {approvalRequests.map((request) => (
                      <tr key={request.id}>
                        <td>
                          <div className="approval-agent">
                            <strong>{request.agent_name}</strong>
                            <span>{request.agent_external_id}</span>
                          </div>
                        </td>

                        <td>{formatRequestType(request.request_type)}</td>

                        <td>
                          <div className="approval-payload">
                            {formatApprovalPayload(request.request_payload)}
                          </div>
                        </td>

                        <td>
                          <span className={`approval-status ${request.status}`}>
                            {request.status}
                          </span>
                        </td>

                        <td>{request.requested_by}</td>
                        <td>{formatActivityTime(request.created_at)}</td>

                        <td>
                          {request.status === "pending" ? (
                            <div className="approval-decision-actions">
                              <button
                                type="button"
                                className="approve-button"
                                disabled={reviewingApprovalId === request.id}
                                onClick={() =>
                                  handleApprovalDecision(request.id, "approved")
                                }
                              >
                                {reviewingApprovalId === request.id
                                  ? "Reviewing..."
                                  : "Approve"}
                              </button>

                              <button
                                type="button"
                                className="reject-button"
                                disabled={reviewingApprovalId === request.id}
                                onClick={() =>
                                  handleApprovalDecision(request.id, "rejected")
                                }
                              >
                                {reviewingApprovalId === request.id
                                  ? "Reviewing..."
                                  : "Reject"}
                              </button>
                            </div>
                          ) : (
                            <div className="approval-review-meta">
                              <strong>{request.reviewed_by}</strong>
                              <span>{formatActivityTime(request.reviewed_at)}</span>
                              {request.review_note && (
                                <small>{request.review_note}</small>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
        )}
      </main>
    </div>

    {selectedAgent && (
      <>
        <div
          className="drawer-overlay"
          onClick={() => setSelectedAgent(null)}
        />

        <aside className="agent-drawer" aria-label="Agent details">
          <div className="agent-drawer-accent"></div>

          <div className="agent-drawer-header">
            <div>
              <p className="drawer-kicker">Agent Details</p>
              <h2>{selectedAgent.name}</h2>
              <span>{selectedAgent.agent_id}</span>
            </div>

            <button
              className="drawer-close-button"
              type="button"
              aria-label="Close agent details"
              onClick={() => setSelectedAgent(null)}
            >
              <X size={20} strokeWidth={2.2} />
            </button>
          </div>

          <div className="agent-drawer-content">
            <section className="drawer-section">
              <div className="drawer-section-title">
                <ServerCog size={17} strokeWidth={2.2} />
                <h3>Identity</h3>
              </div>

              <div className="drawer-field">
                <span>Agent name</span>
                <strong>{selectedAgent.name}</strong>
              </div>

              <div className="drawer-field">
                <span>Agent ID</span>
                <strong>{selectedAgent.agent_id}</strong>
              </div>

              <div className="drawer-field">
                <span>Description</span>
                <strong>{displayValue(selectedAgent.description)}</strong>
              </div>

              <div className="drawer-field">
                <span>Agent type</span>
                <strong>{displayValue(selectedAgent.agent_type)}</strong>
              </div>
            </section>

            <section className="drawer-section">
              <div className="drawer-section-title">
                <UserRound size={17} strokeWidth={2.2} />
                <h3>Ownership</h3>
              </div>

              <div className="drawer-field">
                <span>Owner name</span>
                <strong>{displayValue(selectedAgent.owner_name)}</strong>
              </div>

              <div className="drawer-field">
                <span>Owner team</span>
                <strong>{displayValue(selectedAgent.owner_team)}</strong>
              </div>
            </section>

            <section className="drawer-section">
              <div className="drawer-section-title">
                <Activity size={17} strokeWidth={2.2} />
                <h3>Runtime</h3>
              </div>

              <div className="drawer-field">
                <span>Status</span>
                <strong>
                  <span className={`drawer-badge status-${selectedAgent.status}`}>
                    {selectedAgent.status}
                  </span>
                </strong>
              </div>

              <div className="drawer-field">
                <span>Integration status</span>
                <strong>
                  <span
                    className={`drawer-badge integration-${selectedAgent.integration_status}`}
                  >
                    {selectedAgent.integration_status}
                  </span>
                </strong>
              </div>

              <div className="drawer-field">
                <span>Endpoint URL</span>
                <strong className="drawer-endpoint">
                  {displayValue(selectedAgent.endpoint_url, "Not connected")}
                </strong>
              </div>

              <div className="drawer-field">
                <span>Created date</span>
                <strong>{formatDate(selectedAgent.created_at)}</strong>
              </div>

              <div className="drawer-field">
                <span>Updated date</span>
                <strong>{formatDate(selectedAgent.updated_at)}</strong>
              </div>
            </section>

            <section className="drawer-section">
              <div className="drawer-section-title">
                <ShieldAlert size={17} strokeWidth={2.2} />
                <h3>Risk and Governance</h3>
              </div>

              <div className="drawer-risk-score">
                <span>Risk score</span>
                <strong>{selectedAgent.risk_score}</strong>
                <small>out of 100</small>
              </div>
            </section>

            <section className="drawer-section">
              <div className="drawer-section-title">
                <ShieldAlert size={17} strokeWidth={2.2} />
                <h3>Policy and Governance</h3>
              </div>

              {policyLoading ? (
                <div className="drawer-policy-message">
                  Loading policy...
                </div>
              ) : selectedPolicy ? (
                <>
                  {policyError && (
                    <div className="drawer-policy-message error">
                      {policyError}
                    </div>
                  )}

                  {isEditingPolicy ? (
                    <div className="policy-form">
                      <label>
                        <span>Policy name</span>
                        <input
                          type="text"
                          value={policyForm.policy_name}
                          onChange={(event) =>
                            handlePolicyFormChange(
                              "policy_name",
                              event.target.value
                            )
                          }
                        />
                      </label>

                      <label>
                        <span>Enforcement status</span>
                        <select
                          value={policyForm.enforcement_status}
                          onChange={(event) =>
                            handlePolicyFormChange(
                              "enforcement_status",
                              event.target.value
                            )
                          }
                        >
                          <option value="draft">draft</option>
                          <option value="enforced">enforced</option>
                          <option value="disabled">disabled</option>
                        </select>
                      </label>

                      <label className="policy-checkbox">
                        <input
                          type="checkbox"
                          checked={policyForm.requires_approval}
                          onChange={(event) =>
                            handlePolicyFormChange(
                              "requires_approval",
                              event.target.checked
                            )
                          }
                        />
                        <span>Requires approval</span>
                      </label>

                      <div className="policy-form-grid">
                        <label>
                          <span>Max actions/hour</span>
                          <input
                            type="number"
                            min="0"
                            value={policyForm.max_actions_per_hour}
                            onChange={(event) =>
                              handlePolicyFormChange(
                                "max_actions_per_hour",
                                event.target.value
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>Risk threshold</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={policyForm.risk_threshold}
                            onChange={(event) =>
                              handlePolicyFormChange(
                                "risk_threshold",
                                event.target.value
                              )
                            }
                          />
                        </label>
                      </div>

                      <label>
                        <span>Allowed actions</span>
                        <textarea
                          rows="3"
                          value={policyForm.allowed_actions}
                          onChange={(event) =>
                            handlePolicyFormChange(
                              "allowed_actions",
                              event.target.value
                            )
                          }
                        />
                        <small>Enter actions separated by commas.</small>
                      </label>

                      <label>
                        <span>Blocked actions</span>
                        <textarea
                          rows="3"
                          value={policyForm.blocked_actions}
                          onChange={(event) =>
                            handlePolicyFormChange(
                              "blocked_actions",
                              event.target.value
                            )
                          }
                        />
                        <small>Enter actions separated by commas.</small>
                      </label>

                      <div className="policy-form-actions">
                        <button
                          type="button"
                          className="policy-save-button"
                          disabled={policySaving}
                          onClick={savePolicy}
                        >
                          {policySaving ? "Saving..." : "Save Policy"}
                        </button>

                        <button
                          type="button"
                          className="policy-cancel-button"
                          disabled={policySaving}
                          onClick={cancelPolicyEdit}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="policy-section-actions">
                        <button
                          type="button"
                          className="policy-edit-button"
                          onClick={startPolicyEdit}
                        >
                          Edit Policy
                        </button>
                      </div>

                      <div className="drawer-field">
                        <span>Policy name</span>
                        <strong>{selectedPolicy.policy_name}</strong>
                      </div>

                      <div className="drawer-field">
                        <span>Enforcement</span>
                        <strong>
                          <span
                            className={`drawer-badge enforcement-${selectedPolicy.enforcement_status}`}
                          >
                            {selectedPolicy.enforcement_status}
                          </span>
                        </strong>
                      </div>

                      <div className="drawer-field">
                        <span>Approval required</span>
                        <strong>
                          {selectedPolicy.requires_approval ? "Yes" : "No"}
                        </strong>
                      </div>

                      <div className="drawer-field">
                        <span>Max actions/hour</span>
                        <strong>{selectedPolicy.max_actions_per_hour}</strong>
                      </div>

                      <div className="drawer-field">
                        <span>Risk threshold</span>
                        <strong className="policy-risk-threshold">
                          {selectedPolicy.risk_threshold}
                        </strong>
                      </div>

                      <div className="drawer-field policy-list-field">
                        <span>Allowed actions</span>
                        <strong>
                          {selectedPolicy.allowed_actions.length === 0 ? (
                            <span className="policy-empty-list">
                              None configured
                            </span>
                          ) : (
                            <span className="policy-tag-list">
                              {selectedPolicy.allowed_actions.map((action) => (
                                <span className="policy-tag" key={action}>
                                  {action}
                                </span>
                              ))}
                            </span>
                          )}
                        </strong>
                      </div>

                      <div className="drawer-field policy-list-field">
                        <span>Blocked actions</span>
                        <strong>
                          {selectedPolicy.blocked_actions.length === 0 ? (
                            <span className="policy-empty-list">
                              None configured
                            </span>
                          ) : (
                            <span className="policy-tag-list">
                              {selectedPolicy.blocked_actions.map((action) => (
                                <span className="policy-tag blocked" key={action}>
                                  {action}
                                </span>
                              ))}
                            </span>
                          )}
                        </strong>
                      </div>
                    </>
                  )}
                </>
              ) : policyError ? (
                <div className="drawer-policy-message error">
                  {policyError}
                </div>
              ) : null}
            </section>
          </div>

          <div className="agent-drawer-footer">
            <button type="button" className="drawer-edit-button">
              Edit Agent
            </button>

            {selectedAgent.status === "disabled" ? (
              <button
                type="button"
                className="drawer-enable-button"
                onClick={() =>
                  updateAgentStatus(
                    selectedAgent.id,
                    "active"
                  )
                }
              >
                Enable Agent
              </button>
            ) : (
              <button
                type="button"
                className="drawer-disable-button"
                onClick={() =>
                  updateAgentStatus(
                    selectedAgent.id,
                    "disabled"
                  )
                }
              >
                Disable Agent
              </button>
            )}
          </div>
        </aside>
      </>
    )}
    </>
  );
}

export default App;
