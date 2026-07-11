const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const db = require("../db");
const { requireAuth, JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Enter your name." });
  }
  if (!email || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const data = db.read();
  const normalizedEmail = email.trim().toLowerCase();

  if (data.users.some((u) => u.email === normalizedEmail)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString()
  };

  data.users.push(user);
  await db.write(data);

  const token = signToken(user.id);
  res.status(201).json({ token, user: publicUser(user) });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Enter your email and password." });
  }

  const data = db.read();
  const normalizedEmail = email.trim().toLowerCase();
  const user = data.users.find((u) => u.email === normalizedEmail);

  if (!user) {
    return res.status(401).json({ error: "No account matches that email and password." });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "No account matches that email and password." });
  }

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user) });
});

// GET /api/auth/me — used on page load to restore a session from a stored token
router.get("/me", requireAuth, (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "Account not found." });
  res.json({ user: publicUser(user) });
});

module.exports = router;
