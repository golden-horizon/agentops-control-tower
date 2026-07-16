const express = require("express");
const pool = require("./database");
const cors = require("cors");

const app = express();
app.use(
  cors({
    origin: "http://localhost:5173"
  })
);

app.use(express.json());

const PORT = process.env.PORT || 5000;
const VALID_AGENT_STATUSES = ["active", "disabled", "offline"];
const VALID_INTEGRATION_STATUSES = ["connected", "demo", "disconnected"];
const VALID_HEALTH_STATUSES = ["healthy", "delayed", "offline", "unknown"];
const VALID_ENFORCEMENT_STATUSES = ["draft", "enforced", "disabled"];
const VALID_APPROVAL_STATUSES = ["pending", "approved", "rejected"];
const VALID_APPROVAL_DECISIONS = ["approved", "rejected"];
const VALID_VIOLATION_SEVERITIES = ["low", "medium", "high", "critical"];
const VALID_VIOLATION_STATUSES = ["open", "investigating", "resolved"];
const VALID_VIOLATION_UPDATE_STATUSES = ["investigating", "resolved"];

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function validatePolicyPayload(policy) {
  if (
    typeof policy.policy_name !== "string" ||
    policy.policy_name.trim().length === 0
  ) {
    return "policy_name must be a non-empty string";
  }

  if (!isStringArray(policy.allowed_actions)) {
    return "allowed_actions must be an array of strings";
  }

  if (!isStringArray(policy.blocked_actions)) {
    return "blocked_actions must be an array of strings";
  }

  if (typeof policy.requires_approval !== "boolean") {
    return "requires_approval must be boolean";
  }

  if (
    !Number.isInteger(policy.max_actions_per_hour) ||
    policy.max_actions_per_hour < 0
  ) {
    return "max_actions_per_hour must be an integer greater than or equal to 0";
  }

  if (
    !Number.isInteger(policy.risk_threshold) ||
    policy.risk_threshold < 0 ||
    policy.risk_threshold > 100
  ) {
    return "risk_threshold must be an integer between 0 and 100";
  }

  if (!VALID_ENFORCEMENT_STATUSES.includes(policy.enforcement_status)) {
    return "enforcement_status must be draft, enforced, or disabled";
  }

  return null;
}

function validateAgentPayload(agent) {
  if (
    typeof agent.name !== "string" ||
    agent.name.trim().length === 0
  ) {
    return "name must be a non-empty string";
  }

  if (typeof agent.description !== "string") {
    return "description must be a string";
  }

  if (
    typeof agent.agent_type !== "string" ||
    agent.agent_type.trim().length === 0
  ) {
    return "agent_type must be a non-empty string";
  }

  if (typeof agent.owner_name !== "string") {
    return "owner_name must be a string";
  }

  if (typeof agent.owner_team !== "string") {
    return "owner_team must be a string";
  }

  if (!VALID_INTEGRATION_STATUSES.includes(agent.integration_status)) {
    return "integration_status must be connected, demo, or disconnected";
  }

  if (
    !Number.isInteger(agent.risk_score) ||
    agent.risk_score < 0 ||
    agent.risk_score > 100
  ) {
    return "risk_score must be an integer between 0 and 100";
  }

  if (
    agent.endpoint_url !== null &&
    typeof agent.endpoint_url !== "string"
  ) {
    return "endpoint_url must be a string or null";
  }

  return null;
}

function validateAgentRegistrationPayload(agent) {
  if (
    typeof agent.agent_id !== "string" ||
    agent.agent_id.trim().length === 0
  ) {
    return "agent_id must be a non-empty string";
  }

  const validationError = validateAgentPayload(agent);

  if (validationError) {
    return validationError;
  }

  if (!VALID_AGENT_STATUSES.includes(agent.status)) {
    return "status must be active, disabled, or offline";
  }

  return null;
}

function validateAgentHeartbeatPayload(payload) {
  if (!VALID_HEALTH_STATUSES.includes(payload.health_status)) {
    return "health_status must be healthy, delayed, offline, or unknown";
  }

  if (
    payload.response_time_ms !== null &&
    (
      !Number.isInteger(payload.response_time_ms) ||
      payload.response_time_ms < 0
    )
  ) {
    return "response_time_ms must be an integer greater than or equal to 0, or null";
  }

  return null;
}

function validateApprovalRequestPayload(payload) {
  if (!Number.isInteger(payload.agent_id)) {
    return "agent_id must be an integer";
  }

  if (
    typeof payload.request_type !== "string" ||
    payload.request_type.trim().length === 0
  ) {
    return "request_type must be a non-empty string";
  }

  if (!isPlainObject(payload.request_payload)) {
    return "request_payload must be an object";
  }

  if (
    payload.requested_by !== undefined &&
    (
      typeof payload.requested_by !== "string" ||
      payload.requested_by.trim().length === 0
    )
  ) {
    return "requested_by must be a non-empty string";
  }

  return null;
}

function validateApprovalDecisionPayload(payload) {
  if (!VALID_APPROVAL_DECISIONS.includes(payload.decision)) {
    return "decision must be approved or rejected";
  }

  if (
    typeof payload.reviewed_by !== "string" ||
    payload.reviewed_by.trim().length === 0
  ) {
    return "reviewed_by must be a non-empty string";
  }

  if (
    payload.review_note !== undefined &&
    payload.review_note !== null &&
    typeof payload.review_note !== "string"
  ) {
    return "review_note must be a string";
  }

  return null;
}

function validatePolicyViolationPayload(payload) {
  if (!Number.isInteger(payload.agent_id)) {
    return "agent_id must be an integer";
  }

  if (
    typeof payload.violation_type !== "string" ||
    payload.violation_type.trim().length === 0
  ) {
    return "violation_type must be a non-empty string";
  }

  if (
    typeof payload.attempted_action !== "string" ||
    payload.attempted_action.trim().length === 0
  ) {
    return "attempted_action must be a non-empty string";
  }

  if (!VALID_VIOLATION_SEVERITIES.includes(payload.severity)) {
    return "severity must be low, medium, high, or critical";
  }

  if (!isPlainObject(payload.details)) {
    return "details must be an object";
  }

  return null;
}

function validatePolicyViolationStatusPayload(payload) {
  if (!VALID_VIOLATION_UPDATE_STATUSES.includes(payload.status)) {
    return "status must be investigating or resolved";
  }

  if (
    typeof payload.resolved_by !== "string" ||
    payload.resolved_by.trim().length === 0
  ) {
    return "resolved_by must be a non-empty string";
  }

  if (
    payload.resolution_note !== undefined &&
    payload.resolution_note !== null &&
    typeof payload.resolution_note !== "string"
  ) {
    return "resolution_note must be a string";
  }

  return null;
}

app.get("/", (req, res) => {
  res.json({
    application: "AgentOps Control Tower",
    status: "running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "agentops-api"
  });
});

app.get("/api/database-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT current_database(), NOW()");

    res.json({
      message: "PostgreSQL connection successful",
      database: result.rows[0].current_database,
      server_time: result.rows[0].now
    });
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.status(500).json({
      message: "PostgreSQL connection failed",
      error: error.message
    });
  }
});

app.get("/api/agents", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        agent_id,
        name,
        description,
        agent_type,
        owner_name,
        owner_team,
        status,
        integration_status,
        health_status,
        last_seen,
        response_time_ms,
        risk_score,
        endpoint_url,
        created_at,
        updated_at
      FROM agents
      ORDER BY id
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to retrieve agents:", error.message);

    res.status(500).json({
      message: "Could not retrieve agents",
      error: error.message
    });
  }
});

app.post("/api/agents", async (req, res) => {
  const validationError = validateAgentRegistrationPayload(req.body);

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  const client = await pool.connect();

  try {
    const {
      agent_id,
      name,
      description,
      agent_type,
      owner_name,
      owner_team,
      status,
      integration_status,
      risk_score,
      endpoint_url
    } = req.body;

    const trimmedAgentId = agent_id.trim();
    const trimmedName = name.trim();
    const trimmedAgentType = agent_type.trim();
    const trimmedDescription = description.trim();
    const trimmedOwnerName = owner_name.trim();
    const trimmedOwnerTeam = owner_team.trim();
    const trimmedEndpointUrl =
      endpoint_url === null
        ? null
        : endpoint_url.trim();

    await client.query("BEGIN");

    const existingAgent = await client.query(
      `
      SELECT id
      FROM agents
      WHERE agent_id = $1
      `,
      [trimmedAgentId]
    );

    if (existingAgent.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "Agent ID already exists"
      });
    }

    const createdAgent = await client.query(
      `
      INSERT INTO agents (
        agent_id,
        name,
        description,
        agent_type,
        owner_name,
        owner_team,
        status,
        integration_status,
        risk_score,
        endpoint_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING
        id,
        agent_id,
        name,
        description,
        agent_type,
        owner_name,
        owner_team,
        status,
        integration_status,
        health_status,
        last_seen,
        response_time_ms,
        risk_score,
        endpoint_url,
        created_at,
        updated_at
      `,
      [
        trimmedAgentId,
        trimmedName,
        trimmedDescription,
        trimmedAgentType,
        trimmedOwnerName,
        trimmedOwnerTeam,
        status,
        integration_status,
        risk_score,
        trimmedEndpointUrl
      ]
    );

    const newAgent = createdAgent.rows[0];

    await client.query(
      `
      INSERT INTO policies (
        agent_id,
        policy_name,
        allowed_actions,
        blocked_actions,
        requires_approval,
        max_actions_per_hour,
        risk_threshold,
        enforcement_status
      )
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)
      `,
      [
        newAgent.id,
        "Default Agent Policy",
        JSON.stringify([]),
        JSON.stringify(["external_write", "privileged_action"]),
        true,
        20,
        60,
        "draft"
      ]
    );

    await client.query(
      `
      INSERT INTO activity_logs (
        agent_id,
        action,
        previous_status,
        new_status,
        performed_by,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        newAgent.id,
        "AGENT_REGISTERED",
        null,
        newAgent.status,
        "Navid",
        JSON.stringify({
          agent_name: newAgent.name,
          agent_external_id: newAgent.agent_id,
          source: "AgentOps Control Center"
        })
      ]
    );

    await client.query("COMMIT");

    res.status(201).json(newAgent);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Agent registration failed:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "Agent ID already exists"
      });
    }

    res.status(500).json({
      error: "Failed to register agent",
      details: error.message
    });
  } finally {
    client.release();
  }
});

app.put("/api/agents/:id", async (req, res) => {
  const validationError = validateAgentPayload(req.body);

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  const client = await pool.connect();

  try {
    const { id } = req.params;
    const {
      name,
      description,
      agent_type,
      owner_name,
      owner_team,
      integration_status,
      risk_score,
      endpoint_url
    } = req.body;

    await client.query("BEGIN");

    const currentAgent = await client.query(
      `
      SELECT id, agent_id, name, status
      FROM agents
      WHERE id = $1
      `,
      [id]
    );

    if (currentAgent.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Agent not found"
      });
    }

    const updatedAgent = await client.query(
      `
      UPDATE agents
      SET name = $1,
          description = $2,
          agent_type = $3,
          owner_name = $4,
          owner_team = $5,
          integration_status = $6,
          risk_score = $7,
          endpoint_url = $8,
          updated_at = NOW()
      WHERE id = $9
      RETURNING
        id,
        agent_id,
        name,
        description,
        agent_type,
        owner_name,
        owner_team,
        status,
        integration_status,
        health_status,
        last_seen,
        response_time_ms,
        risk_score,
        endpoint_url,
        created_at,
        updated_at
      `,
      [
        name.trim(),
        description,
        agent_type.trim(),
        owner_name,
        owner_team,
        integration_status,
        risk_score,
        endpoint_url,
        id
      ]
    );

    await client.query(
      `
      INSERT INTO activity_logs (
        agent_id,
        action,
        previous_status,
        new_status,
        performed_by,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        id,
        "AGENT_UPDATED",
        null,
        updatedAgent.rows[0].status,
        "Navid",
        JSON.stringify({
          agent_name: updatedAgent.rows[0].name,
          agent_external_id: currentAgent.rows[0].agent_id,
          source: "AgentOps Control Center"
        })
      ]
    );

    await client.query("COMMIT");

    res.json(updatedAgent.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Agent update failed:", error);

    res.status(500).json({
      error: "Failed to update agent",
      details: error.message
    });
  } finally {
    client.release();
  }
});

app.put("/api/agents/:id/status", async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!VALID_AGENT_STATUSES.includes(status)) {
      return res.status(400).json({
        error: "Invalid agent status"
      });
    }

    await client.query("BEGIN");

    const currentAgent = await client.query(
      `
      SELECT id, agent_id, name, status
      FROM agents
      WHERE id = $1
      `,
      [id]
    );

    if (currentAgent.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Agent not found"
      });
    }

    const previousStatus = currentAgent.rows[0].status;
    const action =
      previousStatus === "active" && status === "disabled"
        ? "AGENT_DISABLED"
        : previousStatus === "disabled" && status === "active"
        ? "AGENT_ENABLED"
        : "AGENT_STATUS_CHANGED";

    const result = await client.query(
      `
      UPDATE agents
      SET status = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [status, id]
    );

    await client.query(
      `
      INSERT INTO activity_logs (
        agent_id,
        action,
        previous_status,
        new_status,
        performed_by,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        id,
        action,
        previousStatus,
        status,
        "Navid",
        {
          agent_name: currentAgent.rows[0].name,
          source: "AgentOps Control Center"
        }
      ]
    );

    await client.query("COMMIT");

    res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);

    res.status(500).json({
      error: "Failed to update agent"
    });
  } finally {
    client.release();
  }
});

app.put("/api/agents/:id/heartbeat", async (req, res) => {
  const validationError = validateAgentHeartbeatPayload(req.body);

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { health_status, response_time_ms } = req.body;

    await client.query("BEGIN");

    const currentAgent = await client.query(
      `
      SELECT id, name
      FROM agents
      WHERE id = $1
      `,
      [id]
    );

    if (currentAgent.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Agent not found"
      });
    }

    const updatedAgent = await client.query(
      `
      UPDATE agents
      SET health_status = $1,
          response_time_ms = $2,
          last_seen = NOW(),
          updated_at = NOW()
      WHERE id = $3
      RETURNING
        id,
        agent_id,
        name,
        description,
        agent_type,
        owner_name,
        owner_team,
        status,
        integration_status,
        health_status,
        last_seen,
        response_time_ms,
        risk_score,
        endpoint_url,
        created_at,
        updated_at
      `,
      [
        health_status,
        response_time_ms,
        id
      ]
    );

    await client.query(
      `
      INSERT INTO activity_logs (
        agent_id,
        action,
        previous_status,
        new_status,
        performed_by,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        id,
        "AGENT_HEARTBEAT_UPDATED",
        null,
        health_status,
        "Agent Runtime",
        JSON.stringify({
          agent_name: currentAgent.rows[0].name,
          response_time_ms,
          source: "Agent Runtime"
        })
      ]
    );

    await client.query("COMMIT");

    res.json(updatedAgent.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Agent heartbeat update failed:", error);

    res.status(500).json({
      error: "Failed to update agent heartbeat",
      details: error.message
    });
  } finally {
    client.release();
  }
});

app.get("/api/agents/:id/policy", async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await pool.query(
      `
      SELECT id
      FROM agents
      WHERE id = $1
      `,
      [id]
    );

    if (agent.rows.length === 0) {
      return res.status(404).json({
        error: "Agent not found"
      });
    }

    const policy = await pool.query(
      `
      SELECT
        id,
        agent_id,
        policy_name,
        allowed_actions,
        blocked_actions,
        requires_approval,
        max_actions_per_hour,
        risk_threshold,
        enforcement_status,
        created_at,
        updated_at
      FROM policies
      WHERE agent_id = $1
      `,
      [id]
    );

    if (policy.rows.length === 0) {
      return res.status(404).json({
        error: "Policy not found"
      });
    }

    res.json(policy.rows[0]);
  } catch (error) {
    console.error("Failed to retrieve policy:", error.message);

    res.status(500).json({
      error: "Could not retrieve policy"
    });
  }
});

app.put("/api/agents/:id/policy", async (req, res) => {
  const validationError = validatePolicyPayload(req.body);

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  const client = await pool.connect();

  try {
    const { id } = req.params;
    const {
      policy_name,
      allowed_actions,
      blocked_actions,
      requires_approval,
      max_actions_per_hour,
      risk_threshold,
      enforcement_status
    } = req.body;

    await client.query("BEGIN");

    const agent = await client.query(
      `
      SELECT id, name
      FROM agents
      WHERE id = $1
      `,
      [id]
    );

    if (agent.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Agent not found"
      });
    }

    const policy = await client.query(
      `
      UPDATE policies
      SET policy_name = $1,
          allowed_actions = $2::jsonb,
          blocked_actions = $3::jsonb,
          requires_approval = $4,
          max_actions_per_hour = $5,
          risk_threshold = $6,
          enforcement_status = $7,
          updated_at = NOW()
      WHERE agent_id = $8
      RETURNING
        id,
        agent_id,
        policy_name,
        allowed_actions,
        blocked_actions,
        requires_approval,
        max_actions_per_hour,
        risk_threshold,
        enforcement_status,
        created_at,
        updated_at
      `,
      [
        policy_name.trim(),
        JSON.stringify(allowed_actions),
        JSON.stringify(blocked_actions),
        requires_approval,
        max_actions_per_hour,
        risk_threshold,
        enforcement_status,
        id
      ]
    );

    if (policy.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Policy not found"
      });
    }

    await client.query(
      `
      INSERT INTO activity_logs (
        agent_id,
        action,
        previous_status,
        new_status,
        performed_by,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        id,
        "POLICY_UPDATED",
        null,
        enforcement_status,
        "Navid",
        JSON.stringify({
          agent_name: agent.rows[0].name,
          policy_name: policy_name.trim(),
          source: "AgentOps Control Center"
        })
      ]
    );

    await client.query("COMMIT");

    res.json(policy.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Policy update failed:", error);

    res.status(500).json({
      error: "Failed to update policy",
      details: error.message
    });
  } finally {
    client.release();
  }
});

app.post("/api/policy-violations", async (req, res) => {
  const validationError = validatePolicyViolationPayload(req.body);

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  const client = await pool.connect();

  try {
    const {
      agent_id,
      violation_type,
      attempted_action,
      severity,
      details
    } = req.body;
    const trimmedViolationType = violation_type.trim();
    const trimmedAttemptedAction = attempted_action.trim();

    await client.query("BEGIN");

    const agent = await client.query(
      `
      SELECT id, name
      FROM agents
      WHERE id = $1
      `,
      [agent_id]
    );

    if (agent.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Agent not found"
      });
    }

    const policy = await client.query(
      `
      SELECT blocked_actions
      FROM policies
      WHERE agent_id = $1
      `,
      [agent_id]
    );

    if (policy.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Policy not found"
      });
    }

    if (trimmedViolationType === "BLOCKED_ACTION_ATTEMPT") {
      const blockedActions = Array.isArray(policy.rows[0].blocked_actions)
        ? policy.rows[0].blocked_actions
        : [];

      if (!blockedActions.includes(trimmedAttemptedAction)) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "attempted_action is not blocked by this agent policy"
        });
      }
    }

    const violation = await client.query(
      `
      INSERT INTO policy_violations (
        agent_id,
        violation_type,
        attempted_action,
        severity,
        details,
        status
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      RETURNING
        id,
        agent_id,
        violation_type,
        attempted_action,
        severity,
        details,
        status,
        detected_at,
        resolved_at,
        resolved_by,
        resolution_note
      `,
      [
        agent_id,
        trimmedViolationType,
        trimmedAttemptedAction,
        severity,
        JSON.stringify(details),
        "open"
      ]
    );

    await client.query(
      `
      INSERT INTO activity_logs (
        agent_id,
        action,
        previous_status,
        new_status,
        performed_by,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        agent_id,
        "POLICY_VIOLATION_DETECTED",
        null,
        "open",
        "Agent Runtime",
        JSON.stringify({
          agent_name: agent.rows[0].name,
          violation_type: trimmedViolationType,
          attempted_action: trimmedAttemptedAction,
          severity,
          source: "Agent Runtime"
        })
      ]
    );

    await client.query("COMMIT");

    res.status(201).json(violation.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to create policy violation:", error.message);

    res.status(500).json({
      error: "Failed to create policy violation"
    });
  } finally {
    client.release();
  }
});

app.get("/api/policy-violations", async (req, res) => {
  try {
    const { status, severity, agent_id } = req.query;
    const filters = [];
    const params = [];

    if (status) {
      if (!VALID_VIOLATION_STATUSES.includes(status)) {
        return res.status(400).json({
          error: "Invalid policy violation status filter"
        });
      }

      params.push(status);
      filters.push(`policy_violations.status = $${params.length}`);
    }

    if (severity) {
      if (!VALID_VIOLATION_SEVERITIES.includes(severity)) {
        return res.status(400).json({
          error: "Invalid policy violation severity filter"
        });
      }

      params.push(severity);
      filters.push(`policy_violations.severity = $${params.length}`);
    }

    if (agent_id) {
      const parsedAgentId = Number(agent_id);

      if (!Number.isInteger(parsedAgentId)) {
        return res.status(400).json({
          error: "agent_id filter must be an integer"
        });
      }

      params.push(parsedAgentId);
      filters.push(`policy_violations.agent_id = $${params.length}`);
    }

    const whereClause = filters.length > 0
      ? `WHERE ${filters.join(" AND ")}`
      : "";

    const result = await pool.query(
      `
      SELECT
        policy_violations.id,
        policy_violations.agent_id,
        policy_violations.violation_type,
        policy_violations.attempted_action,
        policy_violations.severity,
        policy_violations.details,
        policy_violations.status,
        policy_violations.detected_at,
        policy_violations.resolved_at,
        policy_violations.resolved_by,
        policy_violations.resolution_note,
        agents.name AS agent_name,
        agents.agent_id AS agent_external_id
      FROM policy_violations
      JOIN agents
        ON agents.id = policy_violations.agent_id
      ${whereClause}
      ORDER BY policy_violations.detected_at DESC
      LIMIT 50
      `,
      params
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to retrieve policy violations:", error.message);

    res.status(500).json({
      error: "Could not retrieve policy violations"
    });
  }
});

app.put("/api/policy-violations/:id/status", async (req, res) => {
  const validationError = validatePolicyViolationStatusPayload(req.body);

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { status, resolved_by, resolution_note = "" } = req.body;

    await client.query("BEGIN");

    const violation = await client.query(
      `
      SELECT
        policy_violations.id,
        policy_violations.agent_id,
        policy_violations.status,
        policy_violations.violation_type,
        policy_violations.attempted_action,
        policy_violations.severity,
        agents.name AS agent_name
      FROM policy_violations
      JOIN agents
        ON agents.id = policy_violations.agent_id
      WHERE policy_violations.id = $1::integer
      `,
      [id]
    );

    if (violation.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Policy violation not found"
      });
    }

    const updatedViolation = await client.query(
      `
      UPDATE policy_violations
      SET status = $1::varchar,
          resolved_by = $2::varchar,
          resolution_note = $3::text,
          resolved_at = CASE
            WHEN $1::varchar = 'resolved' THEN NOW()
            ELSE NULL
          END
      WHERE id = $4::integer
      RETURNING
        id,
        agent_id,
        violation_type,
        attempted_action,
        severity,
        details,
        status,
        detected_at,
        resolved_at,
        resolved_by,
        resolution_note
      `,
      [
        status,
        resolved_by.trim(),
        resolution_note ?? "",
        id
      ]
    );

    await client.query(
      `
      INSERT INTO activity_logs (
        agent_id,
        action,
        previous_status,
        new_status,
        performed_by,
        details
      )
      VALUES ($1::integer, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::jsonb)
      `,
      [
        violation.rows[0].agent_id,
        status === "resolved"
          ? "POLICY_VIOLATION_RESOLVED"
          : "POLICY_VIOLATION_INVESTIGATING",
        violation.rows[0].status,
        status,
        resolved_by.trim(),
        JSON.stringify({
          agent_name: violation.rows[0].agent_name,
          violation_type: violation.rows[0].violation_type,
          attempted_action: violation.rows[0].attempted_action,
          severity: violation.rows[0].severity,
          resolution_note: resolution_note ?? "",
          source: "AgentOps Control Center"
        })
      ]
    );

    await client.query("COMMIT");

    res.json(updatedViolation.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to update policy violation status:", error.message);

    res.status(500).json({
      error: "Failed to update policy violation status",
      details: error.message
    });
  } finally {
    client.release();
  }
});

app.get("/api/activity-logs", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        activity_logs.id,
        activity_logs.action,
        activity_logs.previous_status,
        activity_logs.new_status,
        activity_logs.performed_by,
        activity_logs.created_at,
        activity_logs.details,
        agents.name AS agent_name,
        agents.agent_id AS agent_external_id
      FROM activity_logs
      JOIN agents
        ON agents.id = activity_logs.agent_id
      ORDER BY activity_logs.created_at DESC
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to retrieve activity logs:", error.message);

    res.status(500).json({
      error: "Could not retrieve activity logs"
    });
  }
});

app.post("/api/approval-requests", async (req, res) => {
  const validationError = validateApprovalRequestPayload(req.body);

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  const client = await pool.connect();

  try {
    const {
      agent_id,
      request_type,
      request_payload,
      requested_by = "Agent Runtime"
    } = req.body;

    await client.query("BEGIN");

    const agent = await client.query(
      `
      SELECT id, name
      FROM agents
      WHERE id = $1
      `,
      [agent_id]
    );

    if (agent.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Agent not found"
      });
    }

    const approvalRequest = await client.query(
      `
      INSERT INTO approval_requests (
        agent_id,
        request_type,
        request_payload,
        status,
        requested_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        agent_id,
        request_type,
        request_payload,
        status,
        requested_by,
        reviewed_by,
        review_note,
        created_at,
        reviewed_at
      `,
      [
        agent_id,
        request_type.trim(),
        request_payload,
        "pending",
        requested_by.trim()
      ]
    );

    await client.query(
      `
      INSERT INTO activity_logs (
        agent_id,
        action,
        previous_status,
        new_status,
        performed_by,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        agent_id,
        "APPROVAL_REQUESTED",
        null,
        "pending",
        requested_by.trim(),
        {
          agent_name: agent.rows[0].name,
          request_type: request_type.trim(),
          approval_request_id: approvalRequest.rows[0].id,
          source: "AgentOps Control Center"
        }
      ]
    );

    await client.query("COMMIT");

    res.status(201).json(approvalRequest.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to create approval request:", error.message);

    res.status(500).json({
      error: "Failed to create approval request"
    });
  } finally {
    client.release();
  }
});

app.get("/api/approval-requests", async (req, res) => {
  try {
    const { status } = req.query;

    if (status && !VALID_APPROVAL_STATUSES.includes(status)) {
      return res.status(400).json({
        error: "Invalid approval status filter"
      });
    }

    const params = [];
    const whereClause = status
      ? "WHERE approval_requests.status = $1"
      : "";

    if (status) {
      params.push(status);
    }

    const result = await pool.query(
      `
      SELECT
        approval_requests.id,
        approval_requests.request_type,
        approval_requests.request_payload,
        approval_requests.status,
        approval_requests.requested_by,
        approval_requests.reviewed_by,
        approval_requests.review_note,
        approval_requests.created_at,
        approval_requests.reviewed_at,
        agents.name AS agent_name,
        agents.agent_id AS agent_external_id
      FROM approval_requests
      JOIN agents
        ON agents.id = approval_requests.agent_id
      ${whereClause}
      ORDER BY approval_requests.created_at DESC
      LIMIT 50
      `,
      params
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to retrieve approval requests:", error.message);

    res.status(500).json({
      error: "Could not retrieve approval requests"
    });
  }
});

app.put("/api/approval-requests/:id/decision", async (req, res) => {
  const validationError = validateApprovalDecisionPayload(req.body);

  if (validationError) {
    return res.status(400).json({
      error: validationError
    });
  }

  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { decision, reviewed_by, review_note = "" } = req.body;

    await client.query("BEGIN");

    const approvalRequest = await client.query(
      `
      SELECT
        approval_requests.id,
        approval_requests.agent_id,
        approval_requests.request_type,
        approval_requests.status,
        agents.name AS agent_name
      FROM approval_requests
      JOIN agents
        ON agents.id = approval_requests.agent_id
      WHERE approval_requests.id = $1
      `,
      [id]
    );

    if (approvalRequest.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Approval request not found"
      });
    }

    if (approvalRequest.rows[0].status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(409).json({
        error: "Approval request has already been reviewed"
      });
    }

    const updatedRequest = await client.query(
      `
      UPDATE approval_requests
      SET status = $1,
          reviewed_by = $2,
          review_note = $3,
          reviewed_at = NOW()
      WHERE id = $4
      RETURNING
        id,
        agent_id,
        request_type,
        request_payload,
        status,
        requested_by,
        reviewed_by,
        review_note,
        created_at,
        reviewed_at
      `,
      [
        decision,
        reviewed_by.trim(),
        review_note ?? "",
        id
      ]
    );

    await client.query(
      `
      INSERT INTO activity_logs (
        agent_id,
        action,
        previous_status,
        new_status,
        performed_by,
        details
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        approvalRequest.rows[0].agent_id,
        decision === "approved"
          ? "APPROVAL_APPROVED"
          : "APPROVAL_REJECTED",
        "pending",
        decision,
        reviewed_by.trim(),
        {
          agent_name: approvalRequest.rows[0].agent_name,
          request_type: approvalRequest.rows[0].request_type,
          approval_request_id: approvalRequest.rows[0].id,
          review_note: review_note ?? "",
          source: "AgentOps Control Center"
        }
      ]
    );

    await client.query("COMMIT");

    res.json(updatedRequest.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to update approval decision:", error.message);

    res.status(500).json({
      error: "Failed to update approval decision"
    });
  } finally {
    client.release();
  }
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agents (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(150) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      agent_type VARCHAR(100) NOT NULL,
      owner_name VARCHAR(100) NOT NULL DEFAULT '',
      owner_team VARCHAR(100) NOT NULL DEFAULT '',
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      integration_status VARCHAR(30) NOT NULL DEFAULT 'demo',
      health_status VARCHAR(30) NOT NULL DEFAULT 'unknown',
      last_seen TIMESTAMP,
      response_time_ms INTEGER,
      risk_score INTEGER NOT NULL DEFAULT 0,
      endpoint_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT valid_agent_status
        CHECK (status IN ('active', 'disabled', 'offline')),
      CONSTRAINT valid_agent_integration_status
        CHECK (integration_status IN ('connected', 'demo', 'disconnected')),
      CONSTRAINT valid_agent_health_status
        CHECK (health_status IN ('healthy', 'delayed', 'offline', 'unknown')),
      CONSTRAINT valid_agent_risk_score
        CHECK (risk_score BETWEEN 0 AND 100),
      CONSTRAINT valid_agent_response_time
        CHECK (response_time_ms IS NULL OR response_time_ms >= 0)
    )
  `);

  await pool.query(`
    ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS health_status VARCHAR(30) NOT NULL DEFAULT 'unknown'
  `);

  await pool.query(`
    ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP
  `);

  await pool.query(`
    ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS response_time_ms INTEGER
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'valid_agent_health_status'
      ) THEN
        ALTER TABLE agents
        ADD CONSTRAINT valid_agent_health_status
          CHECK (health_status IN ('healthy', 'delayed', 'offline', 'unknown'));
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      action VARCHAR(100) NOT NULL,
      previous_status VARCHAR(30),
      new_status VARCHAR(30),
      performed_by VARCHAR(100) NOT NULL DEFAULT 'Navid',
      details JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_activity_agent
        FOREIGN KEY (agent_id)
        REFERENCES agents(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS policies (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL UNIQUE,
      policy_name VARCHAR(150) NOT NULL DEFAULT 'Default Agent Policy',
      allowed_actions JSONB NOT NULL DEFAULT '[]',
      blocked_actions JSONB NOT NULL DEFAULT '[]',
      requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
      max_actions_per_hour INTEGER NOT NULL DEFAULT 100,
      risk_threshold INTEGER NOT NULL DEFAULT 70,
      enforcement_status VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_policy_agent
        FOREIGN KEY (agent_id)
        REFERENCES agents(id)
        ON DELETE CASCADE,
      CONSTRAINT valid_enforcement_status
        CHECK (enforcement_status IN ('draft', 'enforced', 'disabled')),
      CONSTRAINT valid_policy_risk_threshold
        CHECK (risk_threshold BETWEEN 0 AND 100),
      CONSTRAINT valid_max_actions
        CHECK (max_actions_per_hour >= 0)
    )
  `);

  await pool.query(`
    INSERT INTO policies (
      agent_id,
      policy_name,
      allowed_actions,
      blocked_actions,
      requires_approval,
      max_actions_per_hour,
      risk_threshold,
      enforcement_status
    )
    SELECT
      agents.id,
      CASE
        WHEN agents.name = 'AI SOC Agent'
          THEN 'Security Operations Policy'
        ELSE 'Default Demo Policy'
      END,
      CASE
        WHEN agents.name = 'AI SOC Agent'
          THEN '["analyze_incident", "recommend_response", "read_threat_intel"]'::jsonb
        ELSE '[]'::jsonb
      END,
      CASE
        WHEN agents.name = 'AI SOC Agent'
          THEN '["delete_logs", "modify_policy"]'::jsonb
        ELSE '["external_write", "privileged_action"]'::jsonb
      END,
      TRUE,
      CASE
        WHEN agents.name = 'AI SOC Agent'
          THEN 50
        ELSE 20
      END,
      CASE
        WHEN agents.name = 'AI SOC Agent'
          THEN 70
        ELSE 60
      END,
      CASE
        WHEN agents.name = 'AI SOC Agent'
          THEN 'enforced'
        ELSE 'draft'
      END
    FROM agents
    ON CONFLICT (agent_id) DO NOTHING
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      request_type VARCHAR(100) NOT NULL,
      request_payload JSONB NOT NULL DEFAULT '{}',
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      requested_by VARCHAR(100) NOT NULL DEFAULT 'Agent Runtime',
      reviewed_by VARCHAR(100),
      review_note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP,
      CONSTRAINT fk_approval_agent
        FOREIGN KEY (agent_id)
        REFERENCES agents(id)
        ON DELETE CASCADE,
      CONSTRAINT valid_approval_status
        CHECK (status IN ('pending', 'approved', 'rejected'))
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS policy_violations (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      violation_type VARCHAR(100) NOT NULL,
      attempted_action VARCHAR(150) NOT NULL,
      severity VARCHAR(30) NOT NULL DEFAULT 'medium',
      details JSONB NOT NULL DEFAULT '{}',
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP,
      resolved_by VARCHAR(100),
      resolution_note TEXT,
      CONSTRAINT fk_violation_agent
        FOREIGN KEY (agent_id)
        REFERENCES agents(id)
        ON DELETE CASCADE,
      CONSTRAINT valid_violation_severity
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
      CONSTRAINT valid_violation_status
        CHECK (status IN ('open', 'investigating', 'resolved'))
    )
  `);
}

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`AgentOps API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to initialize AgentOps API:", error.message);
    process.exit(1);
  }
}

startServer();
