-- 部门级别 RBAC
-- 支持按部门分配角色和权限

CREATE TABLE "departments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "head_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "parent_department_id" uuid,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "departments_company_idx" ON "departments"("company_id");
CREATE INDEX "departments_parent_idx" ON "departments"("parent_department_id");
CREATE UNIQUE INDEX "departments_company_name_unique_idx" ON "departments"("company_id", "name");

-- 自引用外键 (需要分两步以避免循环引用问题)
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_fk"
  FOREIGN KEY ("parent_department_id") REFERENCES "departments"("id") ON DELETE SET NULL;

CREATE TABLE "department_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "department_id" uuid NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "permissions" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "department_roles_dept_name_idx" ON "department_roles"("department_id", "name");

CREATE TABLE "department_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "department_id" uuid NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
  "principal_type" text NOT NULL,
  "principal_id" text NOT NULL,
  "department_role_id" uuid REFERENCES "department_roles"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'active',
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "dept_memberships_dept_principal_idx" ON "department_memberships"("department_id", "principal_type", "principal_id");
CREATE INDEX "dept_memberships_principal_idx" ON "department_memberships"("principal_type", "principal_id");
CREATE INDEX "dept_memberships_dept_status_idx" ON "department_memberships"("department_id", "status");
