import { Router } from "express";
import type { Request } from "express";
import type { Db } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { ssoService, type SsoConfigCreateInput } from "../services/sso.js";
import { assertCompanyAccess } from "./authz.js";

function getActorUserId(req: Request): string | null {
  return req.actor.type === "board" ? (req.actor.userId ?? null) : null;
}

function getActorIp(req: Request): string {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.ip || "unknown";
}

function requestBaseUrl(req: Request): string {
  const proto = req.header("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
  const host = req.header("x-forwarded-host")?.split(",")[0]?.trim() || req.header("host") || "";
  return `${proto}://${host}`;
}

export function ssoRoutes(db: Db) {
  const router = Router();
  const svc = ssoService(db);

  // List all SSO providers (for selection UI)
  router.get("/sso/providers", async (_req, res) => {
    const providers = await svc.listProviders();
    res.json({ providers });
  });

  // List SSO configs for a company
  router.get("/companies/:companyId/sso-configs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const configs = await svc.listByCompany(companyId);
    // Strip sensitive config fields
    const safe = configs.map((c) => ({
      ...c,
      config: {
        ...c.config,
        clientId: c.config.clientId ? "***" : undefined,
      },
      // Don't expose encrypted secrets
      encryptedSecrets: undefined,
    }));
    res.json(safe);
  });

  // Get single SSO config
  router.get("/companies/:companyId/sso-configs/:configId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const configId = req.params.configId as string;
    assertCompanyAccess(req, companyId);
    const config = await svc.getByCompanyAndId(companyId, configId);
    if (!config) return res.status(404).json({ error: "SSO config not found" });
    const safe = {
      ...config,
      config: {
        ...config.config,
        clientId: config.config.clientId ? "***" : undefined,
      },
      encryptedSecrets: undefined,
    };
    res.json(safe);
  });

  // Create SSO config
  router.post("/companies/:companyId/sso-configs", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const userId = getActorUserId(req);

    const body = req.body as SsoConfigCreateInput;
    if (!body.provider || !body.name) {
      throw badRequest("provider and name are required");
    }
    if (!body.config) {
      throw badRequest("config is required");
    }

    const config = await svc.create(companyId, userId, body);
    res.status(201).json({
      ...config,
      config: { ...config.config, clientId: config.config.clientId ? "***" : undefined },
      encryptedSecrets: undefined,
    });
  });

  // Update SSO config
  router.patch("/companies/:companyId/sso-configs/:configId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const configId = req.params.configId as string;
    assertCompanyAccess(req, companyId);
    const userId = getActorUserId(req);

    const body = req.body as Partial<SsoConfigCreateInput>;
    const config = await svc.update(configId, companyId, userId, body);
    res.json({
      ...config,
      config: { ...config.config, clientId: config.config.clientId ? "***" : undefined },
      encryptedSecrets: undefined,
    });
  });

  // Delete SSO config
  router.delete("/companies/:companyId/sso-configs/:configId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const configId = req.params.configId as string;
    assertCompanyAccess(req, companyId);
    await svc.delete(configId, companyId);
    res.status(204).send();
  });

  // Test SSO connection
  router.post("/companies/:companyId/sso-configs/:configId/test", async (req, res) => {
    const companyId = req.params.companyId as string;
    const configId = req.params.configId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.testConnection(configId, companyId);
    res.json(result);
  });

  // Initiate SSO login - get redirect URL
  router.post("/companies/:companyId/sso-login", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const configId = req.body.configId as string | undefined;
    const redirectAfter = req.body.redirectAfter as string | undefined;

    let targetConfigId = configId;
    if (!targetConfigId) {
      const defaultConfig = await svc.getDefaultConfig(companyId);
      if (!defaultConfig) throw badRequest("No default SSO configured for this company");
      targetConfigId = defaultConfig.id;
    }

    const loginUrl = await svc.buildLoginUrl(targetConfigId, companyId, redirectAfter);
    res.json({ loginUrl, configId: targetConfigId });
  });

  // SSO callback (OAuth2/OIDC authorization code exchange)
  // This is a generic callback - actual provider-specific logic would go here
  router.get("/sso/callback/:configId", async (req, res) => {
    const configId = req.params.configId as string;
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const error = req.query.error as string | undefined;

    if (error) {
      res.redirect(`/sso/error?error=${encodeURIComponent(error)}`);
      return;
    }

    if (!code || !state) {
      res.redirect("/sso/error?error=missing_params");
      return;
    }

    let parsedState: { configId: string; companyId: string; redirectAfter?: string };
    try {
      parsedState = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    } catch {
      res.redirect("/sso/error?error=invalid_state");
      return;
    }

    if (parsedState.configId !== configId) {
      res.redirect("/sso/error?error=state_mismatch");
      return;
    }

    const config = await svc.getById(configId);
    if (!config) {
      res.redirect("/sso/error?error=config_not_found");
      return;
    }

    // In production, exchange code for tokens with the provider
    // For now, redirect to a UI page that shows the login flow
    // The actual token exchange would be server-side with the provider
    const callbackUrl = `/sso/pending?configId=${configId}&companyId=${parsedState.companyId}&redirectAfter=${encodeURIComponent(parsedState.redirectAfter || "")}`;

    // Log the callback event
    await svc.logAudit(
      parsedState.companyId,
      configId,
      "login_callback_received",
      null,
      getActorIp(req),
      config.provider,
      { hasCode: Boolean(code) },
    );

    res.redirect(callbackUrl);
  });

  // SSO audit log
  router.get("/companies/:companyId/sso-audit", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const configId = req.query.configId as string | undefined;
    const log = await svc.listAuditLog(companyId, configId);
    res.json(log);
  });

  return router;
}
