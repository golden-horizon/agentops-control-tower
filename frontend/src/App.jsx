import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import ghLogo from "./assets/gh-logo.png";
import {
  Activity,
  MoreVertical,
  ServerCog,
  ShieldAlert,
  UserRound,
  X
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "");
const apiUrl = (path) => `${API_BASE_URL}${path}`;

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

function formatLastSeen(value) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatResponseTime(value) {
  return value === null || value === undefined ? "—" : `${value} ms`;
}

function formatHealthLabel(status = "unknown") {
  const labels = {
    healthy: "Healthy",
    delayed: "Delayed",
    offline: "Offline",
    unknown: "Unknown"
  };

  return labels[status] ?? labels.unknown;
}

function formatViolationType(value = "") {
  const words = value
    .split("_")
    .map((word) => word.toLowerCase())
    .join(" ");

  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatViolationDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return "No additional details recorded.";
  }

  if (details.reason) {
    return details.reason;
  }

  return JSON.stringify(details);
}

function formatActionLabel(action) {
  if (action === "AGENT_REGISTERED") {
    return "Agent registered";
  }

  if (action === "AGENT_DISABLED") {
    return "Agent disabled";
  }

  if (action === "AGENT_ENABLED") {
    return "Agent enabled";
  }

  if (action === "AGENT_UPDATED") {
    return "Agent updated";
  }

  if (action === "AGENT_HEARTBEAT_UPDATED") {
    return "Heartbeat updated";
  }

  if (action === "POLICY_VIOLATION_DETECTED") {
    return "Policy violation detected";
  }

  if (action === "POLICY_UPDATED") {
    return "Policy updated";
  }

  if (action === "APPROVAL_REQUESTED") {
    return "Approval requested";
  }

  if (action === "APPROVAL_APPROVED") {
    return "Approval approved";
  }

  if (action === "APPROVAL_REJECTED") {
    return "Approval rejected";
  }

  if (action === "POLICY_VIOLATION_INVESTIGATING") {
    return "Violation investigating";
  }

  if (action === "POLICY_VIOLATION_RESOLVED") {
    return "Violation resolved";
  }

  return "Status changed";
}

function formatLogDetail(log) {
  const details = log.details ?? {};

  if (log.action === "AGENT_HEARTBEAT_UPDATED") {
    return `Response time: ${formatResponseTime(details.response_time_ms)}`;
  }

  if (log.action === "APPROVAL_REQUESTED") {
    return `Request type: ${formatRequestType(details.request_type ?? "unknown")}`;
  }

  if (log.action === "POLICY_VIOLATION_DETECTED") {
    return `${details.attempted_action ?? "Unknown action"} / ${
      details.severity ?? "unknown"
    }`;
  }

  if (details.policy_name) {
    return `Policy: ${details.policy_name}`;
  }

  if (details.review_note) {
    return details.review_note;
  }

  if (details.violation_type) {
    return formatViolationType(details.violation_type);
  }

  if (details.agent_external_id) {
    return details.agent_external_id;
  }

  return "Recorded by AgentOps";
}

function getRiskTier(score) {
  if (score >= 80) {
    return "high";
  }

  if (score >= 60) {
    return "medium";
  }

  return "low";
}

async function fetchActivityLogs() {
  const response = await fetch(apiUrl("/api/activity-logs"));

  if (!response.ok) {
    throw new Error("Could not load activity logs");
  }

  return response.json();
}

async function fetchAgentPolicy(agentId) {
  const response = await fetch(
    apiUrl(`/api/agents/${agentId}/policy`)
  );

  if (!response.ok) {
    throw new Error("Could not load agent policy");
  }

  return response.json();
}

function createAgentForm(agent) {
  return {
    name: agent?.name ?? "",
    description: agent?.description ?? "",
    agent_type: agent?.agent_type ?? "",
    owner_name: agent?.owner_name ?? "",
    owner_team: agent?.owner_team ?? "",
    integration_status: agent?.integration_status ?? "demo",
    risk_score: agent?.risk_score ?? 0,
    endpoint_url: agent?.endpoint_url ?? ""
  };
}

function createRegistrationForm() {
  return {
    agent_id: "",
    name: "",
    description: "",
    agent_type: "",
    owner_name: "",
    owner_team: "",
    integration_status: "demo",
    risk_score: 50,
    endpoint_url: ""
  };
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
      ? apiUrl("/api/approval-requests")
      : apiUrl(`/api/approval-requests?status=${filter}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Could not load approval requests");
  }

  return response.json();
}

async function fetchPolicyViolations(filter) {
  const url =
    filter === "all"
      ? apiUrl("/api/policy-violations")
      : apiUrl(`/api/policy-violations?status=${filter}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Could not load policy violations");
  }

  return response.json();
}

function App() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerSaving, setRegisterSaving] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [registerForm, setRegisterForm] = useState(createRegistrationForm);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [isEditingAgent, setIsEditingAgent] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentEditError, setAgentEditError] = useState("");
  const [agentForm, setAgentForm] = useState({
    name: "",
    description: "",
    agent_type: "",
    owner_name: "",
    owner_team: "",
    integration_status: "demo",
    risk_score: 0,
    endpoint_url: ""
  });
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
  const [policyViolations, setPolicyViolations] = useState([]);
  const [violationsLoading, setViolationsLoading] = useState(false);
  const [violationsError, setViolationsError] = useState("");
  const [violationFilter, setViolationFilter] = useState("all");
  const [updatingViolationId, setUpdatingViolationId] = useState(null);
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policiesError, setPoliciesError] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  const [auditFilter, setAuditFilter] = useState("all");
  const registeredAgentsRef = useRef(null);

  const loadAgents = async ({ showLoading = false } = {}) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const response = await fetch(apiUrl("/api/agents"));

      if (!response.ok) {
        throw new Error("Could not load agents");
      }

      const data = await response.json();
      setAgents(data);
    } catch (err) {
      setError(err.message);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const loadActivityLogs = async () => {
    try {
      const logs = await fetchActivityLogs();
      setActivityLogs(logs);
    } catch (err) {
      console.error(err);
    }
  };

  const loadOverviewPolicyViolations = async () => {
    try {
      const violations = await fetchPolicyViolations("all");
      setPolicyViolations(violations);
    } catch (err) {
      console.error(err);
    }
  };

  const loadOverviewApprovals = async () => {
    try {
      const requests = await fetchApprovalRequests("all");
      setApprovalRequests(requests);
    } catch (err) {
      console.error(err);
    }
  };

  const openRegisterModal = () => {
    setRegisterForm(createRegistrationForm());
    setRegisterError("");
    setRegisterSuccess("");
    setIsRegisterModalOpen(true);
  };

  const closeRegisterModal = () => {
    if (registerSaving) {
      return;
    }

    setIsRegisterModalOpen(false);
    setRegisterError("");
  };

  const handleRegisterFormChange = (field, value) => {
    setRegisterForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const submitRegisterAgent = async () => {
    const requiredFields = [
      ["agent_id", "Agent ID is required."],
      ["name", "Agent Name is required."],
      ["agent_type", "Agent Type is required."]
    ];
    const missingField = requiredFields.find(
      ([field]) => registerForm[field].trim().length === 0
    );

    if (missingField) {
      setRegisterError(missingField[1]);
      return;
    }

    const riskScore = Number(registerForm.risk_score);

    if (
      !Number.isInteger(riskScore) ||
      riskScore < 0 ||
      riskScore > 100
    ) {
      setRegisterError("Risk Score must be an integer from 0 to 100.");
      return;
    }

    setRegisterSaving(true);
    setRegisterError("");

    try {
      const endpointUrl = registerForm.endpoint_url.trim();
      const response = await fetch(apiUrl("/api/agents"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          agent_id: registerForm.agent_id,
          name: registerForm.name,
          description: registerForm.description,
          agent_type: registerForm.agent_type,
          owner_name: registerForm.owner_name,
          owner_team: registerForm.owner_team,
          status: "active",
          integration_status: registerForm.integration_status,
          risk_score: riskScore,
          endpoint_url: endpointUrl === "" ? null : endpointUrl
        })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));

        throw new Error(
          errorBody.details ||
          errorBody.error ||
          "Failed to register agent"
        );
      }

      await loadAgents();
      await loadActivityLogs();

      setRegisterForm(createRegistrationForm());
      setIsRegisterModalOpen(false);
      setRegisterSuccess("Agent registered successfully");
    } catch (error) {
      console.error(error);
      setRegisterError(error.message || "Could not register agent.");
    } finally {
      setRegisterSaving(false);
    }
  };

  useEffect(() => {
    loadAgents({ showLoading: true });
    loadActivityLogs();
    loadOverviewApprovals();
    loadOverviewPolicyViolations();
  }, []);

  useEffect(() => {
    if (activeView !== "overview") {
      return;
    }

    loadOverviewApprovals();
    loadOverviewPolicyViolations();
  }, [activeView]);

  useEffect(() => {
    if (!isRegisterModalOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeRegisterModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRegisterModalOpen, registerSaving]);

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

  useEffect(() => {
    if (activeView !== "policy-alerts") {
      return;
    }

    async function loadPolicyViolations() {
      setViolationsLoading(true);
      setViolationsError("");

      try {
        const violations = await fetchPolicyViolations(violationFilter);
        setPolicyViolations(violations);
      } catch (err) {
        console.error(err);
        setViolationsError("Could not load policy violations.");
      } finally {
        setViolationsLoading(false);
      }
    }

    loadPolicyViolations();
  }, [activeView, violationFilter]);

  useEffect(() => {
    if (activeView !== "policies") {
      return;
    }

    async function loadPolicies() {
      setPoliciesLoading(true);
      setPoliciesError("");

      try {
        const policyRecords = await Promise.all(
          agents.map(async (agent) => {
            const policy = await fetchAgentPolicy(agent.id);

            return {
              agent,
              policy
            };
          })
        );

        setPolicies(policyRecords);
      } catch (err) {
        console.error(err);
        setPoliciesError("Could not load policies.");
      } finally {
        setPoliciesLoading(false);
      }
    }

    loadPolicies();
  }, [activeView, agents]);

  const metrics = useMemo(() => {
    const totalAgents = agents.length;
    const connectedAgents = agents.filter(
      (agent) => agent.integration_status === "connected"
    ).length;
    const healthyAgents = agents.filter(
      (agent) => agent.health_status === "healthy"
    ).length;
    const delayedAgents = agents.filter(
      (agent) => agent.health_status === "delayed"
    ).length;
    const offlineAgents = agents.filter(
      (agent) => agent.health_status === "offline"
    ).length;
    const unknownAgents = agents.filter(
      (agent) => !agent.health_status || agent.health_status === "unknown"
    ).length;
    const highRiskAgents = agents.filter(
      (agent) => agent.risk_score >= 70
    ).length;
    const disabledAgents = agents.filter(
      (agent) => agent.status === "disabled"
    ).length;

    return {
      totalAgents,
      connectedAgents,
      healthyAgents,
      delayedAgents,
      offlineAgents,
      unknownAgents,
      highRiskAgents,
      disabledAgents
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

  const violationSummary = useMemo(() => {
    return {
      total: policyViolations.length,
      open: policyViolations.filter((violation) => violation.status === "open")
        .length,
      investigating: policyViolations.filter(
        (violation) => violation.status === "investigating"
      ).length,
      resolved: policyViolations.filter(
        (violation) => violation.status === "resolved"
      ).length,
      critical: policyViolations.filter(
        (violation) => violation.severity === "critical"
      ).length
    };
  }, [policyViolations]);

  const overviewViolationMetrics = useMemo(() => {
    const openViolations = policyViolations.filter(
      (violation) => violation.status === "open"
    ).length;
    const investigatingViolations = policyViolations.filter(
      (violation) => violation.status === "investigating"
    ).length;
    const criticalActiveViolations = policyViolations.filter(
      (violation) =>
        violation.severity === "critical" && violation.status !== "resolved"
    ).length;

    return {
      openViolations,
      investigatingViolations,
      criticalActiveViolations,
      activeViolations: openViolations + investigatingViolations
    };
  }, [policyViolations]);

  const overviewGovernanceMetrics = useMemo(() => {
    return {
      pendingApprovals: approvalRequests.filter(
        (request) => request.status === "pending"
      ).length,
      highestRisk: Math.max(...agents.map((agent) => agent.risk_score), 0),
      policyCoverageLabel: "Configured coverage",
      policyCoverageValue: "80%"
    };
  }, [agents, approvalRequests]);

  const agentPageSummary = useMemo(() => {
    return {
      total: metrics.totalAgents,
      active: agents.filter((agent) => agent.status === "active").length,
      disabled: metrics.disabledAgents,
      healthy: metrics.healthyAgents,
      highRisk: metrics.highRiskAgents
    };
  }, [agents, metrics]);

  const policySummary = useMemo(() => {
    return {
      total: policies.length,
      enforced: policies.filter(
        (record) => record.policy.enforcement_status === "enforced"
      ).length,
      draft: policies.filter(
        (record) => record.policy.enforcement_status === "draft"
      ).length,
      disabled: policies.filter(
        (record) => record.policy.enforcement_status === "disabled"
      ).length,
      approvalRequired: policies.filter(
        (record) => record.policy.requires_approval
      ).length
    };
  }, [policies]);

  const runtimeActivityActions = [
    "AGENT_HEARTBEAT_UPDATED",
    "APPROVAL_REQUESTED",
    "POLICY_VIOLATION_DETECTED"
  ];
  const auditActionGroups = {
    agents: [
      "AGENT_REGISTERED",
      "AGENT_UPDATED",
      "AGENT_ENABLED",
      "AGENT_DISABLED"
    ],
    policies: ["POLICY_UPDATED"],
    approvals: ["APPROVAL_APPROVED", "APPROVAL_REJECTED"],
    violations: [
      "POLICY_VIOLATION_INVESTIGATING",
      "POLICY_VIOLATION_RESOLVED"
    ]
  };
  const auditActions = Object.values(auditActionGroups).flat();

  const filteredRuntimeActivity = useMemo(() => {
    return activityLogs.filter((log) => {
      if (!runtimeActivityActions.includes(log.action)) {
        return false;
      }

      if (activityFilter === "heartbeats") {
        return log.action === "AGENT_HEARTBEAT_UPDATED";
      }

      if (activityFilter === "approval-requests") {
        return log.action === "APPROVAL_REQUESTED";
      }

      if (activityFilter === "violations") {
        return log.action === "POLICY_VIOLATION_DETECTED";
      }

      return true;
    });
  }, [activityLogs, activityFilter]);

  const filteredAuditLogs = useMemo(() => {
    return activityLogs.filter((log) => {
      if (!auditActions.includes(log.action)) {
        return false;
      }

      if (auditFilter === "all") {
        return true;
      }

      return auditActionGroups[auditFilter]?.includes(log.action);
    });
  }, [activityLogs, auditFilter]);

  const openPolicyAlertsFromOverview = () => {
    setViolationFilter(
      overviewViolationMetrics.openViolations > 0 ? "open" : "all"
    );
    setActiveView("policy-alerts");
  };

  const openApprovalsFromOverview = () => {
    setApprovalFilter("pending");
    setActiveView("approvals");
  };

  const focusRegisteredAgentsTable = () => {
    registeredAgentsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    registeredAgentsRef.current?.focus({ preventScroll: true });
  };

  const updateAgentStatus = async (
    agentId,
    status
  ) => {
    try {
      const response = await fetch(
        apiUrl(`/api/agents/${agentId}/status`),
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

  const openAgentDetails = async (agent, options = {}) => {
    setSelectedAgent(agent);
    setAgentForm(createAgentForm(agent));
    setIsEditingAgent(Boolean(options.edit));
    setIsEditingPolicy(false);
    setAgentEditError("");
    setOpenMenuId(null);
    setPolicyLoading(true);
    setPolicyError("");
    setSelectedPolicy(null);
    setIsEditingPolicy(false);

    try {
      const policy = await fetchAgentPolicy(agent.id);
      setSelectedPolicy(policy);
      setPolicyForm(createPolicyForm(policy));

      if (options.editPolicy) {
        setAgentEditError("");
        setPolicyError("");
        setIsEditingAgent(false);
        setIsEditingPolicy(true);
      }
    } catch (error) {
      console.error(error);
      setPolicyError("Could not load policy details.");
    } finally {
      setPolicyLoading(false);
    }
  };

  const closeAgentDrawer = () => {
    if (agentSaving || policySaving) {
      return;
    }

    setSelectedAgent(null);
    setIsEditingAgent(false);
    setIsEditingPolicy(false);
    setAgentEditError("");
    setPolicyError("");
  };

  const handleAgentFormChange = (field, value) => {
    setAgentForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const startAgentEdit = () => {
    if (!selectedAgent) {
      return;
    }

    setAgentForm(createAgentForm(selectedAgent));
    setAgentEditError("");
    setPolicyError("");
    setIsEditingPolicy(false);
    setIsEditingAgent(true);
  };

  const cancelAgentEdit = () => {
    setAgentForm(createAgentForm(selectedAgent));
    setAgentEditError("");
    setIsEditingAgent(false);
  };

  const saveAgent = async () => {
    if (!selectedAgent) {
      return;
    }

    setAgentSaving(true);
    setAgentEditError("");

    try {
      const endpointUrl = agentForm.endpoint_url.trim();
      const response = await fetch(
        apiUrl(`/api/agents/${selectedAgent.id}`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: agentForm.name,
            description: agentForm.description,
            agent_type: agentForm.agent_type,
            owner_name: agentForm.owner_name,
            owner_team: agentForm.owner_team,
            integration_status: agentForm.integration_status,
            risk_score: Number(agentForm.risk_score),
            endpoint_url: endpointUrl === "" ? null : endpointUrl
          })
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));

        throw new Error(
          errorBody.details ||
          errorBody.error ||
          "Failed to update agent"
        );
      }

      const updatedAgent = await response.json();

      setAgents((previous) =>
        previous.map((agent) =>
          agent.id === updatedAgent.id
            ? updatedAgent
            : agent
        )
      );
      setSelectedAgent(updatedAgent);
      setAgentForm(createAgentForm(updatedAgent));
      setIsEditingAgent(false);

      const logs = await fetchActivityLogs();
      setActivityLogs(logs);
    } catch (error) {
      console.error(error);
      setAgentEditError(error.message || "Could not save agent.");
    } finally {
      setAgentSaving(false);
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
    setAgentEditError("");
    setIsEditingAgent(false);
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
        apiUrl(`/api/agents/${selectedAgent.id}/policy`),
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
        apiUrl(`/api/approval-requests/${requestId}/decision`),
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

  const refreshPolicyViolations = async () => {
    const violations = await fetchPolicyViolations(violationFilter);
    setPolicyViolations(violations);
  };

  const updatePolicyViolationStatus = async (violationId, status) => {
    setUpdatingViolationId(violationId);
    setViolationsError("");

    try {
      const response = await fetch(
        apiUrl(`/api/policy-violations/${violationId}/status`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            status,
            resolved_by: "Navid",
            resolution_note:
              status === "resolved"
                ? "Resolved in AgentOps Control Center"
                : "Under investigation in AgentOps Control Center"
          })
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));

        throw new Error(
          errorBody.details ||
          errorBody.error ||
          "Failed to update policy violation"
        );
      }

      await refreshPolicyViolations();
      await loadActivityLogs();
    } catch (error) {
      console.error(error);
      setViolationsError(
        error.message || "Could not update policy violation."
      );
    } finally {
      setUpdatingViolationId(null);
    }
  };

  const renderAgentsTable = () => (
    <div className="table-wrapper">
      <table className="inventory-table">
        <colgroup>
          <col className="agent-column" />
          <col className="department-column" />
          <col className="runtime-column" />
          <col className="health-column" />
          <col className="risk-column" />
          <col className="status-column" />
          <col className="actions-column" />
        </colgroup>
        <thead>
          <tr>
            <th>Agent</th>
            <th>Department</th>
            <th>Runtime</th>
            <th>Health</th>
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

              <td className="truncate-cell" title={agent.owner_team}>
                {agent.owner_team}
              </td>

              <td>
                <span className={`runtime-badge ${agent.integration_status}`}>
                  {agent.integration_status}
                </span>
              </td>

              <td>
                <span className={`health-badge ${agent.health_status ?? "unknown"}`}>
                  <span
                    className={`health-dot ${agent.health_status ?? "unknown"}`}
                    aria-hidden="true"
                  ></span>
                  {formatHealthLabel(agent.health_status)}
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

                      <button
                        type="button"
                        onClick={() => {
                          openAgentDetails(agent, { edit: true });
                        }}
                      >
                        Edit agent
                      </button>

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
  );

  return (
    <>
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand">
           <div className="brand-mark" aria-hidden="true">
                  <img
                    className="brand-logo"
                    src={ghLogo}
                    alt=""
                  />
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
          <button
            className={`nav-item ${activeView === "agents" ? "active" : ""}`}
            onClick={() => setActiveView("agents")}
          >
            Agents
          </button>
          <button
            className={`nav-item ${activeView === "activity" ? "active" : ""}`}
            onClick={() => setActiveView("activity")}
          >
            Activity
          </button>
          <button
            className={`nav-item ${activeView === "policies" ? "active" : ""}`}
            onClick={() => setActiveView("policies")}
          >
            Policies
          </button>
          <button
            className={`nav-item ${
              activeView === "policy-alerts" ? "active" : ""
            }`}
            onClick={() => setActiveView("policy-alerts")}
          >
            Policy Alerts
          </button>
          <button
            className={`nav-item ${activeView === "approvals" ? "active" : ""}`}
            onClick={() => setActiveView("approvals")}
          >
            Approvals
          </button>
          <button
            className={`nav-item ${activeView === "audit-logs" ? "active" : ""}`}
            onClick={() => setActiveView("audit-logs")}
          >
            Audit Logs
          </button>
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
            <strong className="kpi-value">{metrics.totalAgents}</strong>
            <span className="kpi-note">Across the organisation</span>
          </article>

          <article className="kpi-card">
            <span className="kpi-label">Live integrations</span>
            <strong className="kpi-value">{metrics.connectedAgents}</strong>
            <span className="kpi-note positive">Connected runtime</span>
          </article>

          <button
            className="kpi-card kpi-card-button healthy-agents-kpi"
            type="button"
            onClick={focusRegisteredAgentsTable}
          >
            <span className="kpi-label">Healthy Agents</span>
            <strong className="kpi-value">{metrics.healthyAgents}</strong>
            <span className="kpi-note positive">Operational</span>
          </button>

          <article className="kpi-card">
            <span className="kpi-label">High-risk agents</span>
            <strong className="kpi-value">{metrics.highRiskAgents}</strong>
            <span className="kpi-note warning">Requires monitoring</span>
          </article>

          <button
            className={`kpi-card kpi-card-button pending-approvals-kpi ${
              overviewGovernanceMetrics.pendingApprovals > 0
                ? "warning"
                : "clear"
            }`}
            type="button"
            onClick={openApprovalsFromOverview}
          >
            <span className="kpi-label">Pending Approvals</span>
            <strong className="kpi-value">
              {overviewGovernanceMetrics.pendingApprovals}
            </strong>
            <span
              className={`kpi-note ${
                overviewGovernanceMetrics.pendingApprovals > 0
                  ? "warning"
                  : "positive"
              }`}
            >
              {overviewGovernanceMetrics.pendingApprovals > 0
                ? "Awaiting review"
                : "No pending approvals"}
            </span>
          </button>

          <button
            className={`kpi-card kpi-card-button policy-violations-kpi ${
              overviewViolationMetrics.criticalActiveViolations > 0
                ? "danger"
                : overviewViolationMetrics.activeViolations > 0
                ? "warning"
                : "clear"
            }`}
            type="button"
            onClick={openPolicyAlertsFromOverview}
          >
            <span className="kpi-label">Policy Violations</span>
            <strong className="kpi-value">
              {overviewViolationMetrics.activeViolations}
            </strong>
            <span
              className={`kpi-note ${
                overviewViolationMetrics.criticalActiveViolations > 0
                  ? "danger"
                  : overviewViolationMetrics.activeViolations > 0
                  ? "warning"
                  : "positive"
              }`}
            >
              {overviewViolationMetrics.activeViolations > 0
                ? "Requires attention"
                : "No active violations"}
            </span>
          </button>

          <article className="kpi-card">
            <span className="kpi-label">Disabled agents</span>
            <strong className="kpi-value">{metrics.disabledAgents}</strong>
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
                <span>CONTROL TOWER</span>
                <small>Policy and governance layer</small>
              </div>

              <div className="connector-line"></div>

              <div className="agent-node-grid">
                {agents.map((agent) => (
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
                {overviewGovernanceMetrics.highestRisk}
              </strong>
              <small>out of 100</small>
            </div>

            <div className="risk-breakdown">
              <div>
                <span>Highest risk</span>
                <strong>{overviewGovernanceMetrics.highestRisk}</strong>
              </div>

              <div>
                <span>Critical controls</span>
                <strong>Enabled</strong>
              </div>

              <div>
                <span>{overviewGovernanceMetrics.policyCoverageLabel}</span>
                <strong>{overviewGovernanceMetrics.policyCoverageValue}</strong>
              </div>

              <div>
                <span>Pending approvals</span>
                <strong>{overviewGovernanceMetrics.pendingApprovals}</strong>
              </div>

              <div>
                <span>Open violations</span>
                <strong>{overviewViolationMetrics.openViolations}</strong>
              </div>

              <div>
                <span>Investigating</span>
                <strong>
                  {overviewViolationMetrics.investigatingViolations}
                </strong>
              </div>

              <div>
                <span>Critical active</span>
                <strong>
                  {overviewViolationMetrics.criticalActiveViolations}
                </strong>
              </div>

              <div>
                <span>Healthy agents</span>
                <strong>{metrics.healthyAgents}</strong>
              </div>
            </div>

            <div className="operational-health-summary">
              <div className="operational-health-header">
                <span>Operational Health</span>
              </div>

              <div className="health-summary-grid">
                <div>
                  <span className="health-dot healthy"></span>
                  <small>Healthy</small>
                  <strong>{metrics.healthyAgents}</strong>
                </div>

                <div>
                  <span className="health-dot delayed"></span>
                  <small>Delayed</small>
                  <strong>{metrics.delayedAgents}</strong>
                </div>

                <div>
                  <span className="health-dot offline"></span>
                  <small>Offline</small>
                  <strong>{metrics.offlineAgents}</strong>
                </div>

                <div>
                  <span className="health-dot unknown"></span>
                  <small>Unknown</small>
                  <strong>{metrics.unknownAgents}</strong>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section
          className="panel inventory-panel"
          ref={registeredAgentsRef}
          tabIndex="-1"
        >
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Inventory</p>
              <h2>Registered Agents</h2>
            </div>

            <button
              className="primary-button"
              type="button"
              onClick={openRegisterModal}
            >
              Register Agent
            </button>
          </div>

          {registerSuccess && (
            <div className="registration-success-message">
              {registerSuccess}
            </div>
          )}

          {renderAgentsTable()}
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
        ) : activeView === "agents" ? (
        <section className="agents-page">
          <header className="topbar page-topbar">
            <div>
              <p className="eyebrow">Agent Inventory</p>
              <h1>Agent Inventory</h1>
              <p className="subtitle">
                Registered AI agents and operational status
              </p>
            </div>

            <button
              className="primary-button"
              type="button"
              onClick={openRegisterModal}
            >
              Register Agent
            </button>
          </header>

          <section className="summary-card-grid five-up">
            <article className="summary-card">
              <span>Total agents</span>
              <strong>{agentPageSummary.total}</strong>
            </article>

            <article className="summary-card approved">
              <span>Active agents</span>
              <strong>{agentPageSummary.active}</strong>
            </article>

            <article className="summary-card rejected">
              <span>Disabled agents</span>
              <strong>{agentPageSummary.disabled}</strong>
            </article>

            <article className="summary-card approved">
              <span>Healthy agents</span>
              <strong>{agentPageSummary.healthy}</strong>
            </article>

            <article className="summary-card pending">
              <span>High-risk agents</span>
              <strong>{agentPageSummary.highRisk}</strong>
            </article>
          </section>

          <section className="panel inventory-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Inventory</p>
                <h2>Registered Agents</h2>
              </div>
            </div>

            {registerSuccess && (
              <div className="registration-success-message">
                {registerSuccess}
              </div>
            )}

            {renderAgentsTable()}
          </section>
        </section>
        ) : activeView === "policies" ? (
        <section className="policies-page">
          <header className="topbar page-topbar">
            <div>
              <p className="eyebrow">Governance</p>
              <h1>Policies</h1>
              <p className="subtitle">
                Policy controls attached to registered agents
              </p>
            </div>
          </header>

          <section className="summary-card-grid five-up">
            <article className="summary-card">
              <span>Total policies</span>
              <strong>{policySummary.total}</strong>
            </article>

            <article className="summary-card approved">
              <span>Enforced</span>
              <strong>{policySummary.enforced}</strong>
            </article>

            <article className="summary-card pending">
              <span>Draft</span>
              <strong>{policySummary.draft}</strong>
            </article>

            <article className="summary-card rejected">
              <span>Disabled</span>
              <strong>{policySummary.disabled}</strong>
            </article>

            <article className="summary-card pending">
              <span>Approval required</span>
              <strong>{policySummary.approvalRequired}</strong>
            </article>
          </section>

          <section className="panel policies-panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Policy Register</p>
                <h2>Agent Policies</h2>
              </div>
            </div>

            {policiesError && (
              <div className="page-table-message error">{policiesError}</div>
            )}

            {policiesLoading ? (
              <div className="page-table-message">Loading policies...</div>
            ) : policies.length === 0 ? (
              <div className="page-table-message">No policies found.</div>
            ) : (
              <div className="standard-table-wrapper">
                <table className="policies-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Policy name</th>
                      <th>Enforcement</th>
                      <th>Approval required</th>
                      <th>Max actions/hour</th>
                      <th>Risk threshold</th>
                      <th>Allowed actions</th>
                      <th>Blocked actions</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {policies.map(({ agent, policy }) => (
                      <tr key={policy.id}>
                        <td>
                          <div className="activity-agent">
                            <strong>{agent.name}</strong>
                            <span>{agent.agent_id}</span>
                          </div>
                        </td>
                        <td>{policy.policy_name}</td>
                        <td>
                          <span
                            className={`drawer-badge enforcement-${policy.enforcement_status}`}
                          >
                            {policy.enforcement_status}
                          </span>
                        </td>
                        <td>{policy.requires_approval ? "Yes" : "No"}</td>
                        <td>{policy.max_actions_per_hour}</td>
                        <td>{policy.risk_threshold}</td>
                        <td>{policy.allowed_actions?.length ?? 0}</td>
                        <td>{policy.blocked_actions?.length ?? 0}</td>
                        <td>
                          <div className="page-row-actions">
                            <button
                              type="button"
                              onClick={() => openAgentDetails(agent)}
                            >
                              View Agent
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openAgentDetails(agent, { editPolicy: true })
                              }
                            >
                              Edit Policy
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
        ) : activeView === "activity" ? (
        <section className="activity-page">
          <header className="topbar page-topbar">
            <div>
              <p className="eyebrow">Runtime Events</p>
              <h1>Runtime Activity</h1>
              <p className="subtitle">
                Events generated by connected agents and runtime services
              </p>
            </div>
          </header>

          <section className="panel activity-page-panel">
            <div className="panel-header page-panel-header">
              <div>
                <p className="panel-kicker">Runtime Stream</p>
                <h2>Events</h2>
              </div>

              <div className="page-filter-group">
                {[
                  ["all", "All"],
                  ["heartbeats", "Heartbeats"],
                  ["approval-requests", "Approval Requests"],
                  ["violations", "Violations"]
                ].map(([filter, label]) => (
                  <button
                    type="button"
                    className={activityFilter === filter ? "active" : ""}
                    key={filter}
                    onClick={() => setActivityFilter(filter)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredRuntimeActivity.length === 0 ? (
              <div className="page-table-message">
                No runtime activity found.
              </div>
            ) : (
              <div className="standard-table-wrapper">
                <table className="runtime-activity-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Agent</th>
                      <th>Event</th>
                      <th>State</th>
                      <th>Source</th>
                      <th>Details</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRuntimeActivity.map((log) => (
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
                            {displayValue(log.new_status, "Recorded")}
                          </span>
                        </td>
                        <td>{log.performed_by}</td>
                        <td>{formatLogDetail(log)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
        ) : activeView === "audit-logs" ? (
        <section className="audit-logs-page">
          <header className="topbar page-topbar">
            <div>
              <p className="eyebrow">Control Plane</p>
              <h1>Audit Logs</h1>
              <p className="subtitle">
                Human and governance changes recorded by the control plane
              </p>
            </div>
          </header>

          <section className="panel audit-logs-panel">
            <div className="panel-header page-panel-header">
              <div>
                <p className="panel-kicker">Governance Trail</p>
                <h2>Administrative Actions</h2>
              </div>

              <div className="page-filter-group">
                {[
                  ["all", "All"],
                  ["agents", "Agents"],
                  ["policies", "Policies"],
                  ["approvals", "Approvals"],
                  ["violations", "Violations"]
                ].map(([filter, label]) => (
                  <button
                    type="button"
                    className={auditFilter === filter ? "active" : ""}
                    key={filter}
                    onClick={() => setAuditFilter(filter)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredAuditLogs.length === 0 ? (
              <div className="page-table-message">
                No audit records found.
              </div>
            ) : (
              <div className="standard-table-wrapper">
                <table className="audit-logs-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Performed By</th>
                      <th>Agent</th>
                      <th>Action</th>
                      <th>Previous State</th>
                      <th>New State</th>
                      <th>Details</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatActivityTime(log.created_at)}</td>
                        <td>{log.performed_by}</td>
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
                        <td>{displayValue(log.previous_status, "None")}</td>
                        <td>{displayValue(log.new_status, "Recorded")}</td>
                        <td>{formatLogDetail(log)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
        ) : activeView === "policy-alerts" ? (
        <section className="policy-alerts-page">
          <header className="topbar policy-alerts-topbar">
            <div>
              <p className="eyebrow">Governance Monitor</p>
              <h1>Policy Alerts</h1>
              <p className="subtitle">
                Governance violations detected across registered agents
              </p>
            </div>
          </header>

          <section className="violation-summary-grid">
            <article className="violation-summary-card">
              <span>Total Violations</span>
              <strong>{violationSummary.total}</strong>
            </article>

            <article className="violation-summary-card open">
              <span>Open</span>
              <strong>{violationSummary.open}</strong>
            </article>

            <article className="violation-summary-card investigating">
              <span>Investigating</span>
              <strong>{violationSummary.investigating}</strong>
            </article>

            <article className="violation-summary-card resolved">
              <span>Resolved</span>
              <strong>{violationSummary.resolved}</strong>
            </article>

            <article className="violation-summary-card critical">
              <span>Critical</span>
              <strong>{violationSummary.critical}</strong>
            </article>
          </section>

          <section className="panel policy-alerts-panel">
            <div className="panel-header policy-alerts-panel-header">
              <div>
                <p className="panel-kicker">Violation Queue</p>
                <h2>Alerts</h2>
              </div>

              <div className="violation-filter-group">
                {["all", "open", "investigating", "resolved"].map((filter) => (
                  <button
                    type="button"
                    className={violationFilter === filter ? "active" : ""}
                    key={filter}
                    onClick={() => setViolationFilter(filter)}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {violationsError && (
              <div className="violations-message error">
                {violationsError}
              </div>
            )}

            {violationsLoading ? (
              <div className="violations-message">
                Loading policy alerts...
              </div>
            ) : policyViolations.length === 0 ? (
              <div className="violations-message">
                No policy violations found.
              </div>
            ) : (
              <div className="violations-table-wrapper">
                <table className="violations-table">
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Agent</th>
                      <th>Violation Type</th>
                      <th>Attempted Action</th>
                      <th>Status</th>
                      <th>Detected</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {policyViolations.map((violation) => (
                      <tr key={violation.id}>
                        <td>
                          <span
                            className={`violation-severity ${violation.severity}`}
                          >
                            {violation.severity}
                          </span>
                        </td>

                        <td>
                          <div className="violation-agent">
                            <strong>{violation.agent_name}</strong>
                            <span>{violation.agent_external_id}</span>
                          </div>
                        </td>

                        <td>{formatViolationType(violation.violation_type)}</td>
                        <td>
                          <span className="violation-action-name">
                            {violation.attempted_action}
                          </span>
                        </td>

                        <td>
                          <span className={`violation-status ${violation.status}`}>
                            {violation.status}
                          </span>
                        </td>

                        <td>{formatActivityTime(violation.detected_at)}</td>

                        <td>
                          <div className="violation-row-actions">
                            {violation.status === "open" && (
                              <button
                                type="button"
                                className="investigate-button"
                                disabled={updatingViolationId === violation.id}
                                onClick={() =>
                                  updatePolicyViolationStatus(
                                    violation.id,
                                    "investigating"
                                  )
                                }
                              >
                                {updatingViolationId === violation.id
                                  ? "Updating..."
                                  : "Investigate"}
                              </button>
                            )}

                            {violation.status === "investigating" && (
                              <button
                                type="button"
                                className="resolve-button"
                                disabled={updatingViolationId === violation.id}
                                onClick={() =>
                                  updatePolicyViolationStatus(
                                    violation.id,
                                    "resolved"
                                  )
                                }
                              >
                                {updatingViolationId === violation.id
                                  ? "Updating..."
                                  : "Resolve"}
                              </button>
                            )}

                            <button
                              type="button"
                              className="details-button"
                              disabled={updatingViolationId === violation.id}
                              onClick={() => setSelectedViolation(violation)}
                            >
                              View Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
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

    {selectedViolation && (
      <>
        <div
          className="drawer-overlay"
          onClick={() => setSelectedViolation(null)}
        ></div>

        <aside
          className="agent-drawer violation-drawer"
          aria-label="Policy violation details"
        >
          <div className="agent-drawer-accent"></div>

          <div className="agent-drawer-header">
            <div>
              <p className="drawer-kicker">Policy Alert</p>
              <h2>{formatViolationType(selectedViolation.violation_type)}</h2>
              <span>{selectedViolation.attempted_action}</span>
            </div>

            <button
              className="drawer-close-button"
              type="button"
              aria-label="Close policy violation details"
              onClick={() => setSelectedViolation(null)}
            >
              <X size={20} strokeWidth={2.2} />
            </button>
          </div>

          <div className="agent-drawer-content">
            <section className="drawer-section">
              <div className="drawer-section-title">
                <ShieldAlert size={17} strokeWidth={2.2} />
                <h3>Violation Details</h3>
              </div>

              <div className="drawer-field">
                <span>Agent name</span>
                <strong>{selectedViolation.agent_name}</strong>
              </div>

              <div className="drawer-field">
                <span>Agent external ID</span>
                <strong>{selectedViolation.agent_external_id}</strong>
              </div>

              <div className="drawer-field">
                <span>Violation type</span>
                <strong>
                  {formatViolationType(selectedViolation.violation_type)}
                </strong>
              </div>

              <div className="drawer-field">
                <span>Attempted action</span>
                <strong>{selectedViolation.attempted_action}</strong>
              </div>

              <div className="drawer-field">
                <span>Severity</span>
                <strong>
                  <span
                    className={`violation-severity ${selectedViolation.severity}`}
                  >
                    {selectedViolation.severity}
                  </span>
                </strong>
              </div>

              <div className="drawer-field">
                <span>Status</span>
                <strong>
                  <span
                    className={`violation-status ${selectedViolation.status}`}
                  >
                    {selectedViolation.status}
                  </span>
                </strong>
              </div>

              <div className="drawer-field violation-detail-text">
                <span>Reason / details</span>
                <strong>
                  {formatViolationDetails(selectedViolation.details)}
                </strong>
              </div>
            </section>

            <section className="drawer-section">
              <div className="drawer-section-title">
                <Activity size={17} strokeWidth={2.2} />
                <h3>Resolution</h3>
              </div>

              <div className="drawer-field">
                <span>Detected at</span>
                <strong>{formatActivityTime(selectedViolation.detected_at)}</strong>
              </div>

              <div className="drawer-field">
                <span>Resolved at</span>
                <strong>
                  {selectedViolation.resolved_at
                    ? formatActivityTime(selectedViolation.resolved_at)
                    : "Not resolved"}
                </strong>
              </div>

              <div className="drawer-field">
                <span>Resolved by</span>
                <strong>{displayValue(selectedViolation.resolved_by)}</strong>
              </div>

              <div className="drawer-field violation-detail-text">
                <span>Resolution note</span>
                <strong>
                  {displayValue(selectedViolation.resolution_note)}
                </strong>
              </div>
            </section>
          </div>
        </aside>
      </>
    )}

    {isRegisterModalOpen && (
      <div
        className="registration-modal-overlay"
        onClick={closeRegisterModal}
      >
        <div
          className="registration-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="registration-modal-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="registration-modal-header">
            <div>
              <p className="drawer-kicker">Agent Inventory</p>
              <h2 id="registration-modal-title">Register New Agent</h2>
            </div>

            <button
              className="drawer-close-button"
              type="button"
              aria-label="Close registration modal"
              disabled={registerSaving}
              onClick={closeRegisterModal}
            >
              <X size={20} strokeWidth={2.2} />
            </button>
          </div>

          <form
            className="registration-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitRegisterAgent();
            }}
          >
            {registerError && (
              <div className="registration-message error">
                {registerError}
              </div>
            )}

            <div className="registration-form-grid">
              <label>
                <span>Agent ID</span>
                <input
                  type="text"
                  value={registerForm.agent_id}
                  onChange={(event) =>
                    handleRegisterFormChange("agent_id", event.target.value)
                  }
                />
              </label>

              <label>
                <span>Agent Name</span>
                <input
                  type="text"
                  value={registerForm.name}
                  onChange={(event) =>
                    handleRegisterFormChange("name", event.target.value)
                  }
                />
              </label>
            </div>

            <label>
              <span>Description</span>
              <textarea
                rows="3"
                value={registerForm.description}
                onChange={(event) =>
                  handleRegisterFormChange("description", event.target.value)
                }
              />
            </label>

            <div className="registration-form-grid">
              <label>
                <span>Agent Type</span>
                <input
                  type="text"
                  value={registerForm.agent_type}
                  onChange={(event) =>
                    handleRegisterFormChange("agent_type", event.target.value)
                  }
                />
              </label>

              <label>
                <span>Owner Name</span>
                <input
                  type="text"
                  value={registerForm.owner_name}
                  onChange={(event) =>
                    handleRegisterFormChange("owner_name", event.target.value)
                  }
                />
              </label>
            </div>

            <div className="registration-form-grid">
              <label>
                <span>Owner Team</span>
                <input
                  type="text"
                  value={registerForm.owner_team}
                  onChange={(event) =>
                    handleRegisterFormChange("owner_team", event.target.value)
                  }
                />
              </label>

              <label>
                <span>Integration Status</span>
                <select
                  value={registerForm.integration_status}
                  onChange={(event) =>
                    handleRegisterFormChange(
                      "integration_status",
                      event.target.value
                    )
                  }
                >
                  <option value="connected">connected</option>
                  <option value="demo">demo</option>
                  <option value="disconnected">disconnected</option>
                </select>
              </label>
            </div>

            <div className="registration-form-grid">
              <label>
                <span>Risk Score</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={registerForm.risk_score}
                  onChange={(event) =>
                    handleRegisterFormChange("risk_score", event.target.value)
                  }
                />
              </label>

              <label>
                <span>Endpoint URL</span>
                <input
                  type="text"
                  value={registerForm.endpoint_url}
                  onChange={(event) =>
                    handleRegisterFormChange("endpoint_url", event.target.value)
                  }
                />
              </label>
            </div>

            <div className="registration-modal-actions">
              <button
                type="button"
                className="registration-cancel-button"
                disabled={registerSaving}
                onClick={closeRegisterModal}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="registration-submit-button"
                disabled={registerSaving}
              >
                {registerSaving ? "Registering..." : "Register Agent"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {selectedAgent && (
      <>
        <div
          className="drawer-overlay"
          onClick={closeAgentDrawer}
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
              onClick={closeAgentDrawer}
            >
              <X size={20} strokeWidth={2.2} />
            </button>
          </div>

          <div className="agent-drawer-content">
            {isEditingAgent ? (
            <section className="drawer-section">
              <div className="drawer-section-title">
                <ServerCog size={17} strokeWidth={2.2} />
                <h3>Agent Configuration</h3>
              </div>

              {agentEditError && (
                <div className="drawer-agent-message error">
                  {agentEditError}
                </div>
              )}

              <div className="agent-form">
                <div className="readonly-agent-id">
                  <span>Agent ID</span>
                  <strong>{selectedAgent.agent_id}</strong>
                </div>

                <label>
                  <span>Name</span>
                  <input
                    type="text"
                    value={agentForm.name}
                    onChange={(event) =>
                      handleAgentFormChange("name", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Description</span>
                  <textarea
                    rows="3"
                    value={agentForm.description}
                    onChange={(event) =>
                      handleAgentFormChange("description", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Agent type</span>
                  <input
                    type="text"
                    value={agentForm.agent_type}
                    onChange={(event) =>
                      handleAgentFormChange("agent_type", event.target.value)
                    }
                  />
                </label>

                <div className="agent-form-grid">
                  <label>
                    <span>Owner name</span>
                    <input
                      type="text"
                      value={agentForm.owner_name}
                      onChange={(event) =>
                        handleAgentFormChange("owner_name", event.target.value)
                      }
                    />
                  </label>

                  <label>
                    <span>Owner team</span>
                    <input
                      type="text"
                      value={agentForm.owner_team}
                      onChange={(event) =>
                        handleAgentFormChange("owner_team", event.target.value)
                      }
                    />
                  </label>
                </div>

                <div className="agent-form-grid">
                  <label>
                    <span>Integration status</span>
                    <select
                      value={agentForm.integration_status}
                      onChange={(event) =>
                        handleAgentFormChange(
                          "integration_status",
                          event.target.value
                        )
                      }
                    >
                      <option value="connected">connected</option>
                      <option value="demo">demo</option>
                      <option value="disconnected">disconnected</option>
                    </select>
                  </label>

                  <label>
                    <span>Risk score</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={agentForm.risk_score}
                      onChange={(event) =>
                        handleAgentFormChange("risk_score", event.target.value)
                      }
                    />
                  </label>
                </div>

                <label>
                  <span>Endpoint URL</span>
                  <input
                    type="text"
                    value={agentForm.endpoint_url}
                    onChange={(event) =>
                      handleAgentFormChange("endpoint_url", event.target.value)
                    }
                  />
                </label>
              </div>
            </section>
            ) : (
            <>
            <section className="drawer-section">
              <div className="drawer-section-title">
                <ServerCog size={17} strokeWidth={2.2} />
                <h3>Agent Configuration</h3>
              </div>

              {isEditingPolicy && (
                <p className="drawer-mode-helper">
                  Agent details remain read-only while editing policy.
                </p>
              )}

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
                <Activity size={17} strokeWidth={2.2} />
                <h3>Agent Health</h3>
              </div>

              <div className="drawer-field">
                <span>Health Status</span>
                <strong>
                  <span
                    className={`drawer-badge health-${
                      selectedAgent.health_status ?? "unknown"
                    }`}
                  >
                    <span
                      className={`health-dot ${
                        selectedAgent.health_status ?? "unknown"
                      }`}
                      aria-hidden="true"
                    ></span>
                    {formatHealthLabel(selectedAgent.health_status)}
                  </span>
                </strong>
              </div>

              <div className="drawer-field">
                <span>Last Seen</span>
                <strong>{formatLastSeen(selectedAgent.last_seen)}</strong>
              </div>

              <div className="drawer-field">
                <span>Response Time</span>
                <strong>
                  {formatResponseTime(selectedAgent.response_time_ms)}
                </strong>
              </div>
            </section>

            <section className="drawer-section">
              <div className="drawer-section-title">
                <ShieldAlert size={17} strokeWidth={2.2} />
                <h3>Risk and Governance</h3>
              </div>

              <div
                className={`drawer-risk-score risk-${getRiskTier(
                  selectedAgent.risk_score
                )}`}
              >
                <div className="drawer-risk-meta">
                  <span>Risk score</span>
                  <strong>{selectedAgent.risk_score}</strong>
                  <small>out of 100</small>
                </div>

                <div className="drawer-risk-bar" aria-hidden="true">
                  <div
                    className="drawer-risk-bar-fill"
                    style={{ width: `${selectedAgent.risk_score}%` }}
                  ></div>
                </div>
              </div>
            </section>
            </>
            )}

            <section
              className={`drawer-section ${
                isEditingAgent ? "read-only-during-agent-edit" : ""
              }`}
            >
              <div className="drawer-section-title">
                <ShieldAlert size={17} strokeWidth={2.2} />
                <h3>Policy and Governance</h3>
              </div>

              {isEditingAgent && (
                <p className="drawer-mode-helper">
                  Policy remains read-only while editing the agent.
                </p>
              )}

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

                    </div>
                  ) : (
                    <>
                      {!isEditingAgent && (
                      <div className="policy-section-actions">
                        <button
                          type="button"
                          className="policy-edit-button"
                          onClick={startPolicyEdit}
                        >
                          Edit Policy
                        </button>
                      </div>
                      )}

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
            {isEditingAgent ? (
            <>
            <button
              type="button"
              className="drawer-cancel-button"
              disabled={agentSaving}
              onClick={cancelAgentEdit}
            >
              Cancel Agent
            </button>

            <button
              type="button"
              className="drawer-save-button"
              disabled={agentSaving}
              onClick={saveAgent}
            >
              {agentSaving ? "Saving..." : "Save Agent"}
            </button>
            </>
            ) : isEditingPolicy ? (
            <>
            <button
              type="button"
              className="drawer-cancel-button"
              disabled={policySaving}
              onClick={cancelPolicyEdit}
            >
              Cancel Policy
            </button>

            <button
              type="button"
              className="drawer-save-button"
              disabled={policySaving}
              onClick={savePolicy}
            >
              {policySaving ? "Saving..." : "Save Policy"}
            </button>
            </>
            ) : (
            <>
            <button
              type="button"
              className="drawer-edit-button"
              onClick={startAgentEdit}
            >
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
            </>
            )}
          </div>
        </aside>
      </>
    )}
    </>
  );
}

export default App;
