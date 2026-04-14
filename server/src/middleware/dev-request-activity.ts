import type { RequestHandler } from "express";
import { beginDevRequestActivity } from "../dev-request-activity.js";

export function devRequestActivityMiddleware(): RequestHandler {
  return (req, res, next) => {
    const finish = beginDevRequestActivity(req.originalUrl);
    if (!finish) {
      next();
      return;
    }

    let finalized = false;
    const finalize = () => {
      if (finalized) return;
      finalized = true;
      finish();
    };

    res.once("finish", finalize);
    res.once("close", finalize);
    next();
  };
}
