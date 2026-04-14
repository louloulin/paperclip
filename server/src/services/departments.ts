import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  departments,
  departmentRoles,
  departmentMemberships,
  companies,
  agents,
} from "@paperclipai/db";

export type DepartmentRoleName = "admin" | "team_lead" | "member" | "viewer";

export const DEFAULT_DEPARTMENT_ROLE_PERMISSIONS: Record<DepartmentRoleName, string[]> = {
  admin: [
    "tasks:create",
    "tasks:assign",
    "tasks:update",
    "tasks:delete",
    "departments:manage",
    "departments:members",
    "budgets:view",
    "secrets:view",
    "secrets:manage",
    "agents:view",
    "agents:manage",
  ],
  team_lead: [
    "tasks:create",
    "tasks:assign",
    "tasks:update",
    "budgets:view",
    "secrets:view",
    "agents:view",
  ],
  member: [
    "tasks:create",
    "tasks:update",
    "budgets:view",
    "agents:view",
  ],
  viewer: [
    "budgets:view",
    "agents:view",
  ],
};

export function departmentService(db: Db) {
  async function listByCompany(companyId: string) {
    return db
      .select({
        id: departments.id,
        companyId: departments.companyId,
        name: departments.name,
        description: departments.description,
        headAgentId: departments.headAgentId,
        parentDepartmentId: departments.parentDepartmentId,
        metadata: departments.metadata,
        createdAt: departments.createdAt,
        updatedAt: departments.updatedAt,
      })
      .from(departments)
      .where(eq(departments.companyId, companyId))
      .orderBy(departments.name);
  }

  async function getById(id: string) {
    return db
      .select()
      .from(departments)
      .where(eq(departments.id, id))
      .then((rows) => rows[0] ?? null);
  }

  async function create(input: {
    companyId: string;
    name: string;
    description?: string | null;
    headAgentId?: string | null;
    parentDepartmentId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const created = await db
      .insert(departments)
      .values({
        companyId: input.companyId,
        name: input.name,
        description: input.description ?? null,
        headAgentId: input.headAgentId ?? null,
        parentDepartmentId: input.parentDepartmentId ?? null,
        metadata: input.metadata ?? {},
      })
      .returning()
      .then((rows) => rows[0]);
    return created;
  }

  async function update(id: string, input: {
    name?: string;
    description?: string | null;
    headAgentId?: string | null;
    parentDepartmentId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const fields: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) fields.name = input.name;
    if (input.description !== undefined) fields.description = input.description;
    if (input.headAgentId !== undefined) fields.headAgentId = input.headAgentId;
    if (input.parentDepartmentId !== undefined) fields.parentDepartmentId = input.parentDepartmentId;
    if (input.metadata !== undefined) fields.metadata = input.metadata;

    return db
      .update(departments)
      .set(fields as Record<string, unknown>)
      .where(eq(departments.id, id))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  async function remove(id: string) {
    return db
      .delete(departments)
      .where(eq(departments.id, id))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  // Department roles
  async function listRoles(departmentId: string) {
    return db
      .select()
      .from(departmentRoles)
      .where(eq(departmentRoles.departmentId, departmentId))
      .orderBy(departmentRoles.name);
  }

  async function createRole(input: {
    departmentId: string;
    name: string;
    description?: string | null;
    permissions?: string[];
  }) {
    return db
      .insert(departmentRoles)
      .values({
        departmentId: input.departmentId,
        name: input.name,
        description: input.description ?? null,
        permissions: input.permissions ?? [],
      })
      .returning()
      .then((rows) => rows[0]);
  }

  async function updateRole(id: string, input: {
    name?: string;
    description?: string | null;
    permissions?: string[];
  }) {
    const fields: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) fields.name = input.name;
    if (input.description !== undefined) fields.description = input.description;
    if (input.permissions !== undefined) fields.permissions = input.permissions;

    return db
      .update(departmentRoles)
      .set(fields as Record<string, unknown>)
      .where(eq(departmentRoles.id, id))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  async function deleteRole(id: string) {
    return db
      .delete(departmentRoles)
      .where(eq(departmentRoles.id, id))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  // Department memberships
  async function listMembers(departmentId: string) {
    return db
      .select()
      .from(departmentMemberships)
      .where(
        and(
          eq(departmentMemberships.departmentId, departmentId),
          eq(departmentMemberships.status, "active"),
        ),
      )
      .orderBy(sql`${departmentMemberships.createdAt} desc`);
  }

  async function addMember(input: {
    departmentId: string;
    principalType: "user" | "agent";
    principalId: string;
    departmentRoleId?: string | null;
  }) {
    const existing = await db
      .select()
      .from(departmentMemberships)
      .where(
        and(
          eq(departmentMemberships.departmentId, input.departmentId),
          eq(departmentMemberships.principalType, input.principalType),
          eq(departmentMemberships.principalId, input.principalId),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (existing) {
      if (existing.status !== "active") {
        return db
          .update(departmentMemberships)
          .set({ status: "active", departmentRoleId: input.departmentRoleId ?? null, updatedAt: new Date() })
          .where(eq(departmentMemberships.id, existing.id))
          .returning()
          .then((rows) => rows[0]);
      }
      return existing;
    }

    return db
      .insert(departmentMemberships)
      .values({
        departmentId: input.departmentId,
        principalType: input.principalType,
        principalId: input.principalId,
        departmentRoleId: input.departmentRoleId ?? null,
        status: "active",
      })
      .returning()
      .then((rows) => rows[0]);
  }

  async function removeMember(departmentId: string, principalType: string, principalId: string) {
    return db
      .update(departmentMemberships)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(
        and(
          eq(departmentMemberships.departmentId, departmentId),
          eq(departmentMemberships.principalType, principalType),
          eq(departmentMemberships.principalId, principalId),
        ),
      )
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  async function updateMemberRole(departmentId: string, principalType: string, principalId: string, departmentRoleId: string | null) {
    return db
      .update(departmentMemberships)
      .set({ departmentRoleId, updatedAt: new Date() })
      .where(
        and(
          eq(departmentMemberships.departmentId, departmentId),
          eq(departmentMemberships.principalType, principalType),
          eq(departmentMemberships.principalId, principalId),
        ),
      )
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  async function getPrincipalDepartments(principalType: string, principalId: string) {
    return db
      .select({
        departmentId: departmentMemberships.departmentId,
        departmentName: departments.name,
        companyId: departments.companyId,
        roleId: departmentMemberships.departmentRoleId,
        roleName: departmentRoles.name,
        permissions: departmentRoles.permissions,
        status: departmentMemberships.status,
      })
      .from(departmentMemberships)
      .innerJoin(departments, eq(departments.id, departmentMemberships.departmentId))
      .leftJoin(departmentRoles, eq(departmentRoles.id, departmentMemberships.departmentRoleId))
      .where(
        and(
          eq(departmentMemberships.principalType, principalType),
          eq(departmentMemberships.principalId, principalId),
          eq(departmentMemberships.status, "active"),
        ),
      );
  }

  async function hasDepartmentPermission(
    principalType: string,
    principalId: string,
    departmentId: string,
    permission: string,
  ): Promise<boolean> {
    const rows = await db
      .select({ permissions: departmentRoles.permissions })
      .from(departmentMemberships)
      .innerJoin(departmentRoles, eq(departmentRoles.id, departmentMemberships.departmentRoleId))
      .where(
        and(
          eq(departmentMemberships.departmentId, departmentId),
          eq(departmentMemberships.principalType, principalType),
          eq(departmentMemberships.principalId, principalId),
          eq(departmentMemberships.status, "active"),
        ),
      )
      .limit(1);

    if (rows.length === 0) return false;
    const perms = rows[0]?.permissions as string[] | null;
    if (!perms) return false;
    return perms.includes(permission) || perms.includes("*");
  }

  // Get full department tree with stats
  async function getDepartmentTree(companyId: string) {
    const depts = await listByCompany(companyId);
    const tree: Array<{
      id: string;
      name: string;
      description: string | null;
      headAgentId: string | null;
      parentDepartmentId: string | null;
      memberCount: number;
      subDepartments: number;
    }> = [];

    for (const dept of depts) {
      const members = await db
        .select()
        .from(departmentMemberships)
        .where(
          and(
            eq(departmentMemberships.departmentId, dept.id),
            eq(departmentMemberships.status, "active"),
          ),
        )
        .then((rows) => rows.length);

      const subDepts = depts.filter((d) => d.parentDepartmentId === dept.id).length;

      tree.push({
        id: dept.id,
        name: dept.name,
        description: dept.description,
        headAgentId: dept.headAgentId,
        parentDepartmentId: dept.parentDepartmentId,
        memberCount: members,
        subDepartments: subDepts,
      });
    }

    return tree;
  }

  return {
    listByCompany,
    getById,
    create,
    update,
    remove,
    listRoles,
    createRole,
    updateRole,
    deleteRole,
    listMembers,
    addMember,
    removeMember,
    updateMemberRole,
    getPrincipalDepartments,
    hasDepartmentPermission,
    getDepartmentTree,
  };
}
