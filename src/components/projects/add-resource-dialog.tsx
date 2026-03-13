/**
 * Add / Edit Resource dialog.
 *
 * Presents a type selector (docker | service | database | cloud | env)
 * then renders per-type config form fields. On submit, the config object is
 * JSON-serialised into `configJson` before being passed to `createResource`
 * or `updateResource`.
 */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X,
  Loader2,
  Container,
  Server,
  Database,
  Cloud,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCreateResource, useUpdateResource } from "@/hooks/useProject";
import { logger } from "@/lib/logger";
import type {
  ResourceType,
  ProjectResource,
  CreateResourceInput,
  UpdateResourceInput,
  DockerResourceConfig,
  ServiceResourceConfig,
  DatabaseResourceConfig,
  CloudResourceConfig,
  EnvResourceConfig,
} from "@devhub/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddResourceDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the dialog opens in edit mode. */
  editTarget?: ProjectResource;
}

/** Internal form state — typed object, serialised to configJson on submit. */
type ConfigDraft =
  | Partial<DockerResourceConfig>
  | Partial<ServiceResourceConfig>
  | Partial<DatabaseResourceConfig>
  | Partial<CloudResourceConfig>
  | Partial<EnvResourceConfig>;

// ─── Constants ────────────────────────────────────────────────────────────────

const RESOURCE_TYPES: { value: ResourceType; label: string; icon: React.ReactNode }[] = [
  { value: "docker", label: "Docker", icon: <Container className="h-4 w-4" /> },
  { value: "service", label: "Service", icon: <Server className="h-4 w-4" /> },
  { value: "database", label: "Database", icon: <Database className="h-4 w-4" /> },
  { value: "cloud", label: "Cloud", icon: <Cloud className="h-4 w-4" /> },
  { value: "env", label: "Env / Secret", icon: <KeyRound className="h-4 w-4" /> },
];

// ─── Field helpers ────────────────────────────────────────────────────────────

function fieldCls(error?: boolean) {
  return cn(
    "w-full rounded border bg-background px-3 py-1.5 text-xs text-foreground",
    "placeholder:text-muted-foreground",
    "focus:outline-none focus:ring-1 focus:ring-ring",
    "disabled:opacity-50",
    error ? "border-destructive" : "border-border"
  );
}

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
      {children}
    </label>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

// ─── Per-type config forms ────────────────────────────────────────────────────

interface DockerFormProps {
  value: Partial<DockerResourceConfig>;
  onChange: (v: Partial<DockerResourceConfig>) => void;
}

function DockerConfigForm({ value, onChange }: DockerFormProps) {
  return (
    <>
      <Field>
        <Label htmlFor="res-container-name">Container Name</Label>
        <input
          id="res-container-name"
          type="text"
          className={fieldCls()}
          placeholder="my-app"
          value={value.containerName ?? ""}
          onChange={(e) => onChange({ ...value, containerName: e.target.value })}
        />
      </Field>
      <Field>
        <Label htmlFor="res-image">Image</Label>
        <input
          id="res-image"
          type="text"
          className={fieldCls()}
          placeholder="nginx:latest"
          value={value.image ?? ""}
          onChange={(e) => onChange({ ...value, image: e.target.value })}
        />
      </Field>
    </>
  );
}

interface ServiceFormProps {
  value: Partial<ServiceResourceConfig>;
  onChange: (v: Partial<ServiceResourceConfig>) => void;
  portError?: string;
}

function ServiceConfigForm({ value, onChange, portError }: ServiceFormProps) {
  return (
    <>
      <Field>
        <Label htmlFor="res-port">Port</Label>
        <input
          id="res-port"
          type="number"
          min={1}
          max={65535}
          className={fieldCls(Boolean(portError))}
          placeholder="3000"
          value={value.port ?? ""}
          onChange={(e) =>
            onChange({ ...value, port: e.target.value ? parseInt(e.target.value, 10) : undefined })
          }
        />
        {portError && <p className="text-2xs text-destructive">{portError}</p>}
      </Field>
      <Field>
        <Label htmlFor="res-protocol">Protocol</Label>
        <select
          id="res-protocol"
          className={fieldCls()}
          value={value.protocol ?? "http"}
          onChange={(e) =>
            onChange({ ...value, protocol: e.target.value as "http" | "https" | "tcp" })
          }
        >
          <option value="http">HTTP</option>
          <option value="https">HTTPS</option>
          <option value="tcp">TCP</option>
        </select>
      </Field>
    </>
  );
}

interface DatabaseFormProps {
  value: Partial<DatabaseResourceConfig>;
  onChange: (v: Partial<DatabaseResourceConfig>) => void;
  connError?: string;
}

function DatabaseConfigForm({ value, onChange, connError }: DatabaseFormProps) {
  return (
    <>
      <Field>
        <Label htmlFor="res-db-type">Database Type</Label>
        <select
          id="res-db-type"
          className={fieldCls()}
          value={value.dbType ?? "postgres"}
          onChange={(e) =>
            onChange({
              ...value,
              dbType: e.target.value as DatabaseResourceConfig["dbType"],
            })
          }
        >
          <option value="postgres">PostgreSQL</option>
          <option value="mysql">MySQL</option>
          <option value="sqlite">SQLite</option>
          <option value="redis">Redis</option>
          <option value="mongodb">MongoDB</option>
        </select>
      </Field>
      <Field>
        <Label htmlFor="res-conn-str">Connection String</Label>
        <input
          id="res-conn-str"
          type="password"
          autoComplete="off"
          className={fieldCls(Boolean(connError))}
          placeholder="postgres://user:pass@localhost:5432/db"
          value={value.connectionString ?? ""}
          onChange={(e) => onChange({ ...value, connectionString: e.target.value })}
        />
        <p className="text-2xs text-muted-foreground">Stored locally — never sent to agents.</p>
        {connError && <p className="text-2xs text-destructive">{connError}</p>}
      </Field>
    </>
  );
}

interface CloudFormProps {
  value: Partial<CloudResourceConfig>;
  onChange: (v: Partial<CloudResourceConfig>) => void;
}

function CloudConfigForm({ value, onChange }: CloudFormProps) {
  return (
    <>
      <Field>
        <Label htmlFor="res-provider">Provider</Label>
        <select
          id="res-provider"
          className={fieldCls()}
          value={value.provider ?? "aws"}
          onChange={(e) =>
            onChange({ ...value, provider: e.target.value as CloudResourceConfig["provider"] })
          }
        >
          <option value="aws">AWS</option>
          <option value="gcp">GCP</option>
          <option value="azure">Azure</option>
        </select>
      </Field>
      <Field>
        <Label htmlFor="res-region">Region</Label>
        <input
          id="res-region"
          type="text"
          className={fieldCls()}
          placeholder="us-east-1"
          value={value.region ?? ""}
          onChange={(e) => onChange({ ...value, region: e.target.value })}
        />
      </Field>
      <Field>
        <Label htmlFor="res-cloud-resource-type">Resource Type</Label>
        <input
          id="res-cloud-resource-type"
          type="text"
          className={fieldCls()}
          placeholder="s3-bucket"
          value={value.resourceType ?? ""}
          onChange={(e) => onChange({ ...value, resourceType: e.target.value })}
        />
      </Field>
    </>
  );
}

interface EnvFormProps {
  value: Partial<EnvResourceConfig>;
  onChange: (v: Partial<EnvResourceConfig>) => void;
  keyError?: string;
}

function EnvConfigForm({ value, onChange, keyError }: EnvFormProps) {
  return (
    <>
      <Field>
        <Label htmlFor="res-env-key">Key</Label>
        <input
          id="res-env-key"
          type="text"
          className={fieldCls(Boolean(keyError))}
          placeholder="DATABASE_URL"
          value={value.key ?? ""}
          onChange={(e) => onChange({ ...value, key: e.target.value })}
        />
        {keyError && <p className="text-2xs text-destructive">{keyError}</p>}
      </Field>
      <Field>
        <Label htmlFor="res-env-value">Value</Label>
        <input
          id="res-env-value"
          type="password"
          autoComplete="off"
          className={fieldCls()}
          placeholder="••••••••"
          value={value.value ?? ""}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
        <p className="text-2xs text-muted-foreground">Stored locally — displayed redacted.</p>
      </Field>
    </>
  );
}

// ─── Default config factories ─────────────────────────────────────────────────

function defaultDraft(type: ResourceType): ConfigDraft {
  switch (type) {
    case "docker":
      return { containerName: "", image: "" } satisfies Partial<DockerResourceConfig>;
    case "service":
      return { port: 3000, protocol: "http" } satisfies Partial<ServiceResourceConfig>;
    case "database":
      return { connectionString: "", dbType: "postgres" } satisfies Partial<DatabaseResourceConfig>;
    case "cloud":
      return { provider: "aws", region: "", resourceType: "" } satisfies Partial<CloudResourceConfig>;
    case "env":
      return { key: "", value: "" } satisfies Partial<EnvResourceConfig>;
  }
}

/**
 * Parse a saved `configJson` string back into a typed draft for the form.
 * Falls back to the default draft if parsing fails.
 */
function parseDraft(type: ResourceType, configJson: string): ConfigDraft {
  try {
    return JSON.parse(configJson) as ConfigDraft;
  } catch {
    return defaultDraft(type);
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface ValidationErrors {
  name?: string;
  port?: string;
  connectionString?: string;
  key?: string;
}

function validate(
  name: string,
  type: ResourceType,
  draft: ConfigDraft
): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!name.trim()) {
    errors.name = "Name is required.";
  }
  if (type === "service") {
    const c = draft as Partial<ServiceResourceConfig>;
    if (!c.port || c.port < 1 || c.port > 65535) {
      errors.port = "Port must be between 1 and 65535.";
    }
  }
  if (type === "database") {
    const c = draft as Partial<DatabaseResourceConfig>;
    if (!c.connectionString?.trim()) {
      errors.connectionString = "Connection string is required.";
    }
  }
  if (type === "env") {
    const c = draft as Partial<EnvResourceConfig>;
    if (!c.key?.trim()) {
      errors.key = "Key is required.";
    }
  }
  return errors;
}

// ─── Main dialog component ────────────────────────────────────────────────────

export function AddResourceDialog({
  projectId,
  open,
  onOpenChange,
  editTarget,
}: AddResourceDialogProps) {
  const isEdit = Boolean(editTarget);

  const [selectedType, setSelectedType] = React.useState<ResourceType>(
    editTarget?.resourceType ?? "docker"
  );
  const [name, setName] = React.useState(editTarget?.name ?? "");
  const [draft, setDraft] = React.useState<ConfigDraft>(
    editTarget
      ? parseDraft(editTarget.resourceType, editTarget.configJson)
      : defaultDraft("docker")
  );
  const [errors, setErrors] = React.useState<ValidationErrors>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const createMutation = useCreateResource(projectId);
  const updateMutation = useUpdateResource(projectId);

  // Reset state when dialog opens / edit target changes
  React.useEffect(() => {
    if (open) {
      const type = editTarget?.resourceType ?? "docker";
      setSelectedType(type);
      setName(editTarget?.name ?? "");
      setDraft(
        editTarget ? parseDraft(editTarget.resourceType, editTarget.configJson) : defaultDraft(type)
      );
      setErrors({});
      setSubmitError(null);
    }
  }, [open, editTarget]);

  const handleTypeChange = (type: ResourceType) => {
    setSelectedType(type);
    setDraft(defaultDraft(type));
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const validationErrors = validate(name, selectedType, draft);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const configJson = JSON.stringify(draft);

    try {
      if (isEdit && editTarget) {
        const input: UpdateResourceInput = {
          id: editTarget.id,
          name: name.trim(),
          configJson,
        };
        await updateMutation.mutateAsync(input);
      } else {
        const input: CreateResourceInput = {
          projectId,
          resourceType: selectedType,
          name: name.trim(),
          configJson,
        };
        await createMutation.mutateAsync(input);
      }
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = String(err);
      setSubmitError(msg);
      logger.error("AddResourceDialog", "Failed to save resource", { error: msg });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const renderConfigForm = () => {
    switch (selectedType) {
      case "docker":
        return (
          <DockerConfigForm
            value={draft as Partial<DockerResourceConfig>}
            onChange={(v) => setDraft(v)}
          />
        );
      case "service":
        return (
          <ServiceConfigForm
            value={draft as Partial<ServiceResourceConfig>}
            onChange={(v) => setDraft(v)}
            portError={errors.port}
          />
        );
      case "database":
        return (
          <DatabaseConfigForm
            value={draft as Partial<DatabaseResourceConfig>}
            onChange={(v) => setDraft(v)}
            connError={errors.connectionString}
          />
        );
      case "cloud":
        return (
          <CloudConfigForm
            value={draft as Partial<CloudResourceConfig>}
            onChange={(v) => setDraft(v)}
          />
        );
      case "env":
        return (
          <EnvConfigForm
            value={draft as Partial<EnvResourceConfig>}
            onChange={(v) => setDraft(v)}
            keyError={errors.key}
          />
        );
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "w-[460px] rounded-lg border border-border bg-card shadow-xl",
            "data-[state=open]:animate-fade-in"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <DialogPrimitive.Title className="text-sm font-semibold text-foreground">
              {isEdit ? "Edit Resource" : "Add Resource"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isPending}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
            {/* Type selector — only shown in create mode */}
            {!isEdit && (
              <Field>
                <Label>Type</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {RESOURCE_TYPES.map(({ value, label, icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleTypeChange(value)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded border px-2 py-2 text-2xs font-medium transition-colors",
                        selectedType === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                      )}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {/* Resource name */}
            <Field>
              <Label htmlFor="res-name">Name</Label>
              <input
                id="res-name"
                type="text"
                className={fieldCls(Boolean(errors.name))}
                placeholder="My resource"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                disabled={isPending}
              />
              {errors.name && <p className="text-2xs text-destructive">{errors.name}</p>}
            </Field>

            {/* Per-type config fields */}
            {renderConfigForm()}

            {/* Submit error */}
            {submitError && (
              <p className="text-xs text-destructive">{submitError}</p>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : null}
                {isEdit ? "Save Changes" : "Add Resource"}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
