import { api } from "./client";

export interface Department {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  headAgentId: string | null;
  parentDepartmentId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  subDepartments?: number;
}

export interface DepartmentRole {
  id: string;
  departmentId: string;
  name: string;
  description: string | null;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentMember {
  id: string;
  departmentId: string;
  principalType: "user" | "agent";
  principalId: string;
  departmentRoleId: string | null;
  status: "active" | "inactive";
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  displayName: string;
  roleName: string | null;
}

export interface PrincipalDepartment {
  departmentId: string;
  departmentName: string;
  companyId: string;
  roleId: string | null;
  roleName: string | null;
  permissions: string[] | null;
  status: string;
}

export interface DepartmentCreate {
  name: string;
  description?: string;
  headAgentId?: string;
  parentDepartmentId?: string;
}

export interface DepartmentUpdate {
  name?: string;
  description?: string | null;
  headAgentId?: string | null;
  parentDepartmentId?: string | null;
}

export interface AddMemberInput {
  principalType: "user" | "agent";
  principalId: string;
  departmentRoleId?: string;
}

const BASE = "/api";

export const departmentsApi = {
  list(companyId: string): Promise<Department[]> {
    return api.get(`${BASE}/companies/${companyId}/departments`);
  },

  get(id: string): Promise<Department> {
    return api.get(`${BASE}/departments/${id}`);
  },

  create(companyId: string, data: DepartmentCreate): Promise<Department> {
    return api.post(`${BASE}/companies/${companyId}/departments`, data);
  },

  update(id: string, data: DepartmentUpdate): Promise<Department> {
    return api.patch(`${BASE}/departments/${id}`, data);
  },

  delete(id: string): Promise<{ deleted: boolean }> {
    return api.delete(`${BASE}/departments/${id}`);
  },

  listRoles(departmentId: string): Promise<DepartmentRole[]> {
    return api.get(`${BASE}/departments/${departmentId}/roles`);
  },

  createRole(departmentId: string, data: { name: string; description?: string; permissions?: string[] }): Promise<DepartmentRole> {
    return api.post(`${BASE}/departments/${departmentId}/roles`, data);
  },

  updateRole(id: string, data: { name?: string; description?: string; permissions?: string[] }): Promise<DepartmentRole> {
    return api.patch(`${BASE}/department-roles/${id}`, data);
  },

  deleteRole(id: string): Promise<{ deleted: boolean; id: string }> {
    return api.delete(`${BASE}/department-roles/${id}`);
  },

  listMembers(departmentId: string): Promise<DepartmentMember[]> {
    return api.get(`${BASE}/departments/${departmentId}/members`);
  },

  addMember(departmentId: string, data: AddMemberInput): Promise<DepartmentMember> {
    return api.post(`${BASE}/departments/${departmentId}/members`, data);
  },

  removeMember(departmentId: string, principalType: string, principalId: string): Promise<{ removed: boolean }> {
    return api.delete(`${BASE}/departments/${departmentId}/members/${principalType}/${encodeURIComponent(principalId)}`);
  },

  updateMemberRole(departmentId: string, principalType: string, principalId: string, departmentRoleId: string | null): Promise<DepartmentMember> {
    return api.patch(`${BASE}/departments/${departmentId}/members/${principalType}/${encodeURIComponent(principalId)}`, { departmentRoleId });
  },

  getPermissions(companyId: string): Promise<{ permissions: string[]; roleDefaults: Record<string, string[]> }> {
    return api.get(`${BASE}/companies/${companyId}/departments/permissions`);
  },
};
