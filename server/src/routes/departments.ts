import { Router } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  departments,
  departmentRoles,
  departmentMemberships,
  agents,
} from "@paperclipai/db";
import {
  departmentService,
  DEFAULT_DEPARTMENT_ROLE_PERMISSIONS,
  accessService,
  logActivity,
} from "../services/index.js";
import { assertCompanyAccess } from "./authz.js";
import { forbidden, notFound, badRequest } from "../errors.js";

export function departmentRoutes(db: Db) {
  const router = Router();
  const deptSvc = departmentService(db);
  const access = accessService(db);

  // List all departments for a company
  router.get("/companies/:companyId/departments", async (req, res) => {
    const companyId = req.params.companyId;
    assertCompanyAccess(req, companyId);

    const depts = await deptSvc.getDepartmentTree(companyId);
    res.json(depts);
  });

  // Get single department
  router.get("/departments/:id", async (req, res) => {
    const id = req.params.id;
    const dept = await deptSvc.getById(id);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    res.json(dept);
  });

  // Create department
  router.post("/companies/:companyId/departments", async (req, res) => {
    const companyId = req.params.companyId;
    assertCompanyAccess(req, companyId);
    const hasPerm = await access.canUser(companyId, req.actor.userId, "users:manage_permissions");
    if (!hasPerm && !access.isInstanceAdmin) {
      throw forbidden("Manage permissions required");
    }

    const { name, description, headAgentId, parentDepartmentId } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      throw badRequest("Department name is required");
    }

    const created = await deptSvc.create({
      companyId,
      name: name.trim(),
      description: description ?? null,
      headAgentId: headAgentId ?? null,
      parentDepartmentId: parentDepartmentId ?? null,
    });

    // Create default roles for the department
    await deptSvc.createRole({
      departmentId: created.id,
      name: "admin",
      description: "Department administrator with full permissions",
      permissions: DEFAULT_DEPARTMENT_ROLE_PERMISSIONS.admin,
    });
    await deptSvc.createRole({
      departmentId: created.id,
      name: "team_lead",
      description: "Team lead with task management permissions",
      permissions: DEFAULT_DEPARTMENT_ROLE_PERMISSIONS.team_lead,
    });
    await deptSvc.createRole({
      departmentId: created.id,
      name: "member",
      description: "Regular department member",
      permissions: DEFAULT_DEPARTMENT_ROLE_PERMISSIONS.member,
    });
    await deptSvc.createRole({
      departmentId: created.id,
      name: "viewer",
      description: "Read-only access",
      permissions: DEFAULT_DEPARTMENT_ROLE_PERMISSIONS.viewer,
    });

    await logActivity(db, {
      companyId,
      actorType: req.actor.type === "agent" ? "agent" : "user",
      actorId: req.actor.type === "agent" ? req.actor.agentId ?? "agent" : req.actor.userId ?? "board",
      action: "department.created",
      entityType: "department",
      entityId: created.id,
      details: { name: created.name },
    });

    res.status(201).json(created);
  });

  // Update department
  router.patch("/departments/:id", async (req, res) => {
    const id = req.params.id;
    const dept = await deptSvc.getById(id);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    const { name, description, headAgentId, parentDepartmentId } = req.body ?? {};
    const updated = await deptSvc.update(id, {
      name: name !== undefined ? (typeof name === "string" ? name.trim() : undefined) : undefined,
      description: description !== undefined ? (typeof description === "string" ? description : null) : undefined,
      headAgentId: headAgentId !== undefined ? (typeof headAgentId === "string" ? headAgentId : null) : undefined,
      parentDepartmentId: parentDepartmentId !== undefined ? (typeof parentDepartmentId === "string" ? parentDepartmentId : null) : undefined,
    });

    await logActivity(db, {
      companyId: dept.companyId,
      actorType: req.actor.type === "agent" ? "agent" : "user",
      actorId: req.actor.type === "agent" ? req.actor.agentId ?? "agent" : req.actor.userId ?? "board",
      action: "department.updated",
      entityType: "department",
      entityId: id,
      details: { name: updated?.name },
    });

    res.json(updated);
  });

  // Delete department
  router.delete("/departments/:id", async (req, res) => {
    const id = req.params.id;
    const dept = await deptSvc.getById(id);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    const removed = await deptSvc.remove(id);

    await logActivity(db, {
      companyId: dept.companyId,
      actorType: req.actor.type === "agent" ? "agent" : "user",
      actorId: req.actor.type === "agent" ? req.actor.agentId ?? "agent" : req.actor.userId ?? "board",
      action: "department.deleted",
      entityType: "department",
      entityId: id,
      details: { name: dept.name },
    });

    res.json(removed);
  });

  // List department roles
  router.get("/departments/:departmentId/roles", async (req, res) => {
    const departmentId = req.params.departmentId;
    const dept = await deptSvc.getById(departmentId);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    const roles = await deptSvc.listRoles(departmentId);
    res.json(roles);
  });

  // Create department role
  router.post("/departments/:departmentId/roles", async (req, res) => {
    const departmentId = req.params.departmentId;
    const dept = await deptSvc.getById(departmentId);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    const { name, description, permissions } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      throw badRequest("Role name is required");
    }

    const role = await deptSvc.createRole({
      departmentId,
      name: name.trim(),
      description: description ?? null,
      permissions: Array.isArray(permissions) ? permissions : [],
    });

    await logActivity(db, {
      companyId: dept.companyId,
      actorType: req.actor.type === "agent" ? "agent" : "user",
      actorId: req.actor.type === "agent" ? req.actor.agentId ?? "agent" : req.actor.userId ?? "board",
      action: "department_role.created",
      entityType: "department_role",
      entityId: role.id,
      details: { departmentId, name: role.name },
    });

    res.status(201).json(role);
  });

  // Update department role
  router.patch("/department-roles/:id", async (req, res) => {
    const id = req.params.id;
    const role = await db.select().from(departmentRoles).where(eq(departmentRoles.id, id)).then((rows) => rows[0] ?? null);
    if (!role) throw notFound("Role not found");
    const dept = await deptSvc.getById(role.departmentId);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    const { name, description, permissions } = req.body ?? {};
    const updated = await deptSvc.updateRole(id, {
      name: name !== undefined ? (typeof name === "string" ? name.trim() : undefined) : undefined,
      description: description !== undefined ? (typeof description === "string" ? description : null) : undefined,
      permissions: permissions !== undefined ? (Array.isArray(permissions) ? permissions : undefined) : undefined,
    });

    res.json(updated);
  });

  // Delete department role
  router.delete("/department-roles/:id", async (req, res) => {
    const id = req.params.id;
    const role = await db.select().from(departmentRoles).where(eq(departmentRoles.id, id)).then((rows) => rows[0] ?? null);
    if (!role) throw notFound("Role not found");
    const dept = await deptSvc.getById(role.departmentId);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    await deptSvc.deleteRole(id);
    res.json({ deleted: true, id });
  });

  // List department members
  router.get("/departments/:departmentId/members", async (req, res) => {
    const departmentId = req.params.departmentId;
    const dept = await deptSvc.getById(departmentId);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    const members = await deptSvc.listMembers(departmentId);
    // Enrich with agent/user info
    const enriched = await Promise.all(
      members.map(async (m) => {
        let displayName = m.principalId;
        if (m.principalType === "agent") {
          const agent = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, m.principalId)).then((rows) => rows[0] ?? null);
          displayName = agent?.name ?? m.principalId;
        }
        const role = m.departmentRoleId
          ? await db.select().from(departmentRoles).where(eq(departmentRoles.id, m.departmentRoleId)).then((rows) => rows[0] ?? null)
          : null;
        return { ...m, displayName, roleName: role?.name ?? null };
      }),
    );

    res.json(enriched);
  });

  // Add department member
  router.post("/departments/:departmentId/members", async (req, res) => {
    const departmentId = req.params.departmentId;
    const dept = await deptSvc.getById(departmentId);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    const { principalType, principalId, departmentRoleId } = req.body ?? {};
    if (!principalType || !principalId) {
      throw badRequest("principalType and principalId are required");
    }
    if (principalType !== "user" && principalType !== "agent") {
      throw badRequest("principalType must be 'user' or 'agent'");
    }

    const member = await deptSvc.addMember({
      departmentId,
      principalType,
      principalId,
      departmentRoleId: departmentRoleId ?? null,
    });

    await logActivity(db, {
      companyId: dept.companyId,
      actorType: req.actor.type === "agent" ? "agent" : "user",
      actorId: req.actor.type === "agent" ? req.actor.agentId ?? "agent" : req.actor.userId ?? "board",
      action: "department.member_added",
      entityType: "department",
      entityId: departmentId,
      details: { principalType, principalId, departmentRoleId },
    });

    res.status(201).json(member);
  });

  // Remove department member
  router.delete("/departments/:departmentId/members/:principalType/:principalId", async (req, res) => {
    const { departmentId, principalType, principalId } = req.params;
    const dept = await deptSvc.getById(departmentId);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    const removed = await deptSvc.removeMember(departmentId, principalType, decodeURIComponent(principalId));

    await logActivity(db, {
      companyId: dept.companyId,
      actorType: req.actor.type === "agent" ? "agent" : "user",
      actorId: req.actor.type === "agent" ? req.actor.agentId ?? "agent" : req.actor.userId ?? "board",
      action: "department.member_removed",
      entityType: "department",
      entityId: departmentId,
      details: { principalType, principalId },
    });

    res.json(removed ?? { removed: false });
  });

  // Update member role
  router.patch("/departments/:departmentId/members/:principalType/:principalId", async (req, res) => {
    const { departmentId, principalType, principalId } = req.params;
    const dept = await deptSvc.getById(departmentId);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    const { departmentRoleId } = req.body ?? {};
    const updated = await deptSvc.updateMemberRole(
      departmentId,
      principalType,
      decodeURIComponent(principalId),
      departmentRoleId ?? null,
    );

    res.json(updated);
  });

  // Get principal's departments (for the current actor)
  router.get("/principals/:principalType/:principalId/departments", async (req, res) => {
    const { principalType, principalId } = req.params;
    const depts = await deptSvc.getPrincipalDepartments(principalType, decodeURIComponent(principalId));
    res.json(depts);
  });

  // Check department permission
  router.get("/departments/:departmentId/permissions/:principalType/:principalId/:permission", async (req, res) => {
    const { departmentId, principalType, principalId, permission } = req.params;
    const dept = await deptSvc.getById(departmentId);
    if (!dept) throw notFound("Department not found");
    assertCompanyAccess(req, dept.companyId);

    const allowed = await deptSvc.hasDepartmentPermission(
      principalType,
      decodeURIComponent(principalId),
      departmentId,
      decodeURIComponent(permission),
    );

    res.json({ allowed });
  });

  // Get available permission keys
  router.get("/companies/:companyId/departments/permissions", async (req, res) => {
    const companyId = req.params.companyId;
    assertCompanyAccess(req, companyId);

    const allPermissions = new Set<string>();
    for (const perms of Object.values(DEFAULT_DEPARTMENT_ROLE_PERMISSIONS)) {
      for (const p of perms) allPermissions.add(p);
    }

    res.json({
      permissions: Array.from(allPermissions).sort(),
      roleDefaults: DEFAULT_DEPARTMENT_ROLE_PERMISSIONS,
    });
  });

  return router;
}
