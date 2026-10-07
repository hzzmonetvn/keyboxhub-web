import { Router } from "express";
import {
  loginNotificationAdmin, authorizeNotificationAdmin, logoutNotificationAdmin, getNotificationSubscriber,
  publicNotificationSettings, saveNotificationSettings, listNotificationSubscribers,
  createNotificationSubscriber, deleteNotificationSubscriber
} from "./notification-settings.js";
import { sendKeyboxNotification } from "./notifications.js";

export function notificationRoutes(getSystemStatus) {
  const router = Router();
  const loginAttempts = new Map();
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.post("/admin/login", (req, res) => {
    const now = Date.now();
    const attempt = loginAttempts.get(req.ip);
    if (attempt && attempt.until > now && attempt.count >= 5) {
      return res.status(429).json({ error: "Too many login attempts. Try again in one minute." });
    }
    const token = loginNotificationAdmin(req.body?.password);
    if (!token) {
      loginAttempts.set(req.ip, { count: attempt && attempt.until > now ? attempt.count + 1 : 1, until: attempt && attempt.until > now ? attempt.until : now + 60000 });
      return res.status(401).json({ error: "Invalid admin password" });
    }
    loginAttempts.delete(req.ip);
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
    req.notificationSubscriber = getNotificationSubscriber(bearerToken(req));
    if (!req.notificationSubscriber) return res.status(401).json({ error: "Invalid access token" });
    next();
  });
  router.get("/", (req, res) => res.json(publicNotificationSettings(req.notificationSubscriber)));
  router.put("/", (req, res) => {
    try {
      res.json(saveNotificationSettings(req.notificationSubscriber, req.body));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  router.post("/test", async (req, res) => {
    const results = await sendKeyboxNotification(req.notificationSubscriber, "keybox.test", {
      id: 0, device_id: "Test notification", algorithm: "test", status: "test",
      is_softbanned: 0, source: "Keybox Hub", uploaded_at: new Date().toISOString(), banned_at: null
    }, null, getSystemStatus());
    res.json({ success: results.length > 0 && results.every(result => result.success), results });
  });
  return router;
}
