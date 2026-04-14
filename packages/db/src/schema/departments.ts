import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

/**
 * Departments - organizational units within a company
 */
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    description: text("description"),
    headAgentId: uuid("head_agent_id").references(() => agents.id),
    parentDepartmentId: uuid("parent_department_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyNameIdx: index("departments_company_idx").on(table.companyId),
    parentDeptIdx: index("departments_parent_idx").on(table.parentDepartmentId),
    companyNameUniqueIdx: uniqueIndex("departments_company_name_unique_idx").on(
      table.companyId,
      table.name,
    ),
  }),
);

/**
 * Department roles - predefined role templates for departments
 */
export const departmentRoles = pgTable(
  "department_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departmentId: uuid("department_id").notNull().references(() => departments.id),
    name: text("name").notNull(),
    description: text("description"),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    departmentNameIdx: uniqueIndex("department_roles_dept_name_idx").on(
      table.departmentId,
      table.name,
    ),
  }),
);

/**
 * Department memberships - assign principals (users/agents) to departments with roles
 */
export const departmentMemberships = pgTable(
  "department_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departmentId: uuid("department_id").notNull().references(() => departments.id),
    principalType: text("principal_type").notNull(), // 'user' | 'agent'
    principalId: text("principal_id").notNull(),
    departmentRoleId: uuid("department_role_id").references(() => departmentRoles.id),
    status: text("status").notNull().default("active"), // 'active' | 'inactive'
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    departmentPrincipalIdx: uniqueIndex("dept_memberships_dept_principal_idx").on(
      table.departmentId,
      table.principalType,
      table.principalId,
    ),
    principalDeptIdx: index("dept_memberships_principal_idx").on(
      table.principalType,
      table.principalId,
    ),
    deptStatusIdx: index("dept_memberships_dept_status_idx").on(
      table.departmentId,
      table.status,
    ),
  }),
);
