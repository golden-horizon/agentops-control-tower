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

const PORT = 5000;
const VALID_AGENT_STATUSES = ["active", "disabled", "offline"];
const VALID_ENFORCEMENT_STATUSES = ["draft", "enforced", "disabled"];
const VALID_APPROVAL_STATUSES = ["pending", "approved", "rejected"];
const VALID_APPROVAL_DECISIONS = ["approved", "rejected"];

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

app.get("/", (req, res) => {
  res.json({
    application: "AgentOps Control Tower",
    status: "running"
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
