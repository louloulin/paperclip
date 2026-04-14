import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import {
  departmentsApi,
  type Department,
  type DepartmentRole,
  type DepartmentMember,
} from "../api/departments";
import { agentsApi } from "../api/agents";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Users,
  Building2,
  Edit2,
  X,
  Check,
} from "lucide-react";

function DepartmentCard({
  department,
  roles,
  onEdit,
  onDelete,
  onViewMembers,
}: {
  department: Department;
  roles: DepartmentRole[];
  onEdit: (d: Department) => void;
  onDelete: (d: Department) => void;
  onViewMembers: (d: Department) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-blue-500" />
          <div>
            <div className="font-semibold text-sm">{department.name}</div>
            {department.description && (
              <div className="text-xs text-muted-foreground">{department.description}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {department.memberCount !== undefined && (
            <span className="text-xs text-muted-foreground">
              {department.memberCount} member{department.memberCount !== 1 ? "s" : ""}
            </span>
          )}
          {department.subDepartments !== undefined && department.subDepartments > 0 && (
            <span className="text-xs text-muted-foreground">
              {department.subDepartments} sub-dept{department.subDepartments !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewMembers(department);
            }}
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
          >
            <Users className="h-3 w-3" /> Members
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(department);
            }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Edit2 className="h-3 w-3" /> Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(department);
            }}
            className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-accent/10">
          <div className="text-xs font-medium text-muted-foreground mb-2">Roles</div>
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <div
                key={role.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-foreground)",
                }}
              >
                <span className="font-medium">{role.name}</span>
                <span className="opacity-60">
                  ({(role.permissions as string[]).length} perms)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateDepartmentModal({
  onClose,
  onCreate,
  creating,
}: {
  onClose: () => void;
  onCreate: (data: { name: string; description?: string }) => void;
  creating: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{ border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-base">Create Department</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">
              Department Name *
            </label>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Engineering, Marketing"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Description</label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="Brief description of the department"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onCreate({ name, description: description || undefined })}
            disabled={!name.trim() || creating}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MembersModal({
  department,
  roles,
  onClose,
  onAddMember,
  onRemoveMember,
  onUpdateRole,
  members,
  agents,
}: {
  department: Department;
  roles: DepartmentRole[];
  onClose: () => void;
  onAddMember: (data: {
    principalType: "user" | "agent";
    principalId: string;
    departmentRoleId?: string;
  }) => void;
  onRemoveMember: (principalType: string, principalId: string) => void;
  onUpdateRole: (
    principalType: string,
    principalId: string,
    departmentRoleId: string | null,
  ) => void;
  members: DepartmentMember[];
  agents: { id: string; name: string }[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState<"user" | "agent">("agent");
  const [selectedId, setSelectedId] = useState("");
  const [selectedRole, setSelectedRole] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-semibold text-base">
              {department.name} — Members
            </h2>
            <p className="text-xs text-muted-foreground">
              {members.length} member(s)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{member.displayName}</div>
                  <div className="text-xs text-muted-foreground">
                    {member.principalType}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="text-xs rounded border border-border bg-background px-2 py-1"
                  value={member.departmentRoleId ?? ""}
                  onChange={(e) =>
                    onUpdateRole(
                      member.principalType,
                      member.principalId,
                      e.target.value || null,
                    )
                  }
                >
                  <option value="">No role</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    onRemoveMember(member.principalType, member.principalId)
                  }
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {showAdd && (
            <div className="rounded-lg border border-border px-4 py-3 bg-accent/10 space-y-2">
              <div className="flex gap-2 items-center">
                <select
                  className="text-xs rounded border border-border bg-background px-2 py-1"
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value as "user" | "agent");
                    setSelectedId("");
                  }}
                >
                  <option value="agent">Agent</option>
                  <option value="user">User</option>
                </select>
                {selectedType === "agent" ? (
                  <select
                    className="flex-1 text-xs rounded border border-border bg-background px-2 py-1"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                  >
                    <option value="">Select agent...</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="flex-1 text-xs rounded border border-border bg-background px-2 py-1"
                    placeholder="User ID"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                  />
                )}
                <button
                  className="text-xs text-blue-500"
                  onClick={() => {
                    if (selectedId) {
                      onAddMember({
                        principalType: selectedType,
                        principalId: selectedId,
                        departmentRoleId: selectedRole || undefined,
                      });
                      setSelectedId("");
                      setSelectedRole("");
                      setShowAdd(false);
                    }
                  }}
                  disabled={!selectedId}
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  className="text-xs text-muted-foreground"
                  onClick={() => setShowAdd(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {!showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-blue-400 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Member
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Departments() {
  const { selectedCompanyId: companyId } = useCompany();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["departments", companyId],
    queryFn: () => departmentsApi.list(companyId!),
    enabled: Boolean(companyId),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ["agents-all", companyId],
    queryFn: () =>
      agentsApi
        .list(companyId!)
        .then((a) =>
          a.map((ag: { id: string; name: string }) => ({
            id: ag.id,
            name: ag.name,
          })),
        ),
    enabled: Boolean(companyId),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [deptRoles, setDeptRoles] = useState<DepartmentRole[]>([]);
  const [deptMembers, setDeptMembers] = useState<DepartmentMember[]>([]);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      departmentsApi.create(companyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments", companyId] });
      setShowCreate(false);
      pushToast({ title: "Department created successfully", tone: "success" });
    },
    onError: () => pushToast({ title: "Failed to create department", tone: "error" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => departmentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments", companyId] });
      pushToast({ title: "Department deleted", tone: "success" });
    },
    onError: () => pushToast({ title: "Failed to delete department", tone: "error" }),
  });

  const viewMembers = async (dept: Department) => {
    setSelectedDept(dept);
    const [roles, members] = await Promise.all([
      departmentsApi.listRoles(dept.id),
      departmentsApi.listMembers(dept.id),
    ]);
    setDeptRoles(roles);
    setDeptMembers(members);
  };

  const addMemberMutation = useMutation({
    mutationFn: ({
      deptId,
      data,
    }: {
      deptId: string;
      data: {
        principalType: "user" | "agent";
        principalId: string;
        departmentRoleId?: string;
      };
    }) => departmentsApi.addMember(deptId, data),
    onSuccess: async () => {
      if (selectedDept) {
        const [roles, members] = await Promise.all([
          departmentsApi.listRoles(selectedDept.id),
          departmentsApi.listMembers(selectedDept.id),
        ]);
        setDeptRoles(roles);
        setDeptMembers(members);
      }
      queryClient.invalidateQueries({ queryKey: ["departments", companyId] });
      pushToast({ title: "Member added", tone: "success" });
    },
    onError: () => pushToast({ title: "Failed to add member", tone: "error" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({
      deptId,
      principalType,
      principalId,
    }: {
      deptId: string;
      principalType: string;
      principalId: string;
    }) =>
      departmentsApi.removeMember(deptId, principalType, principalId),
    onSuccess: async () => {
      if (selectedDept) {
        const [roles, members] = await Promise.all([
          departmentsApi.listRoles(selectedDept.id),
          departmentsApi.listMembers(selectedDept.id),
        ]);
        setDeptRoles(roles);
        setDeptMembers(members);
      }
      queryClient.invalidateQueries({ queryKey: ["departments", companyId] });
      pushToast({ title: "Member removed", tone: "success" });
    },
    onError: () => pushToast({ title: "Failed to remove member", tone: "error" }),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({
      deptId,
      principalType,
      principalId,
      departmentRoleId,
    }: {
      deptId: string;
      principalType: string;
      principalId: string;
      departmentRoleId: string | null;
    }) =>
      departmentsApi.updateMemberRole(deptId, principalType, principalId, departmentRoleId),
    onSuccess: async () => {
      if (selectedDept) {
        const [roles, members] = await Promise.all([
          departmentsApi.listRoles(selectedDept.id),
          departmentsApi.listMembers(selectedDept.id),
        ]);
        setDeptRoles(roles);
        setDeptMembers(members);
      }
      pushToast({ title: "Role updated", tone: "success" });
    },
    onError: () => pushToast({ title: "Failed to update role", tone: "error" }),
  });

  if (isLoading) return <PageSkeleton />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Departments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize agents and users into departments with role-based permissions
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Department
        </Button>
      </div>

      {departments.length === 0 ? (
        <EmptyState
          icon={Building2}
          message="Create your first department to get started."
          action="New Department"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="space-y-3">
          {departments.map((dept) => (
            <DepartmentCard
              key={dept.id}
              department={dept}
              roles={[]}
              onEdit={() => {}}
              onDelete={(d) => {
                if (confirm(`Delete department "${d.name}"?`)) {
                  deleteMutation.mutate(d.id);
                }
              }}
              onViewMembers={viewMembers}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateDepartmentModal
          onClose={() => setShowCreate(false)}
          onCreate={(data) => createMutation.mutate(data)}
          creating={createMutation.isPending}
        />
      )}

      {selectedDept && (
        <MembersModal
          department={selectedDept}
          roles={deptRoles}
          members={deptMembers}
          agents={allAgents}
          onClose={() => setSelectedDept(null)}
          onAddMember={(data) =>
            addMemberMutation.mutate({ deptId: selectedDept.id, data })
          }
          onRemoveMember={(pt, pid) =>
            removeMemberMutation.mutate({
              deptId: selectedDept.id,
              principalType: pt,
              principalId: pid,
            })
          }
          onUpdateRole={(pt, pid, rid) =>
            updateRoleMutation.mutate({
              deptId: selectedDept.id,
              principalType: pt,
              principalId: pid,
              departmentRoleId: rid,
            })
          }
        />
      )}
    </div>
  );
}
