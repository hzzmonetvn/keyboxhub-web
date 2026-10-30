import { Router } from "express";
import {
  loginNotificationAdmin, authorizeNotificationAdmin, logoutNotificationAdmin, getNotificationSubscriber,
  listNotificationSubscribers,
  createNotificationSubscriber, deleteNotificationSubscriber
} from "./notification-settings.js";

export function notificationRoutes(getSystemStatus) {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.post("/admin/login", (req, res) => {
    const token = loginNotificationAdmin(req.body?.password);
    if (!token) return res.status(401).json({ error: "Invalid admin password" });
    res.json({ token });
  });
  const bearerToken = req => req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  router.use("/admin", (req, res, next) => {
    if (!authorizeNotificationAdmin(bearerToken(req))) return res.status(401).json({ error: "Admin login required" });
    next();
  });
  router.get("/admin/subscriptions", (req, res) => res.json({ subscriptions: listNotificationSubscribers() }));
  router.post("/admin/logout", (req, res) => {
    logoutNotificationAdmin();
    res.json({ success: true });
  });
  router.post("/admin/subscriptions", (req, res) => {
    try {
      res.status(201).json(createNotificationSubscriber(req.body?.name));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  router.delete("/admin/subscriptions/:id", (req, res) => {
    if (!deleteNotificationSubscriber(req.params.id)) return res.status(404).json({ error: "Token not found" });
    res.json({ success: true });
  });
  router.use((req, res, next) => {
    if (req.path === "/" || req.path === "/test") return res.status(410).json({ error: "Subscriber notification settings are disabled" });
    req.notificationSubscriber = getNotificationSubscriber(bearerToken(req));
    if (!req.notificationSubscriber) return res.status(401).json({ error: "Invalid access token" });
    next();
  });
  return router;
}
