import { mkdir } from "node:fs/promises";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { config } from "./config";
import { pool } from "./db";
import { errorHandler, notFound } from "./middleware/error";
import { applySecurityHeaders } from "./middleware/security";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { notificationsRouter } from "./routes/notifications";
import { submissionsRouter } from "./routes/submissions";
import { workItemsRouter } from "./routes/workItems";

async function start(): Promise<void> {
  const app = express();
  app.disable("x-powered-by");

  app.use(applySecurityHeaders);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (!config.corsAllowedOrigins) {
          callback(null, true);
          return;
        }
        callback(null, config.corsAllowedOrigins.includes(origin));
      },
      credentials: false,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
      maxAge: 86400,
    }),
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false, limit: "10mb" }));
  app.use(morgan("dev"));

  app.get("/health", async (_req, res, next) => {
    try {
      await pool.query("SELECT 1");
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/work-items", workItemsRouter);
  app.use("/api", submissionsRouter);
  app.use("/api/admin", adminRouter);

  app.use(notFound);
  app.use(errorHandler);

  await mkdir(config.nasMountPath, { recursive: true });
  await app.listen(config.port);
  console.log(`Server listening on http://localhost:${config.port}`);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
