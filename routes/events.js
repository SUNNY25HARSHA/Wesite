const express = require("express");
const crypto = require("crypto");

const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const DEFAULT_FIELD_LABELS = [
  "Venue",
  "Food & Catering",
  "Decor",
  "Photography & Video",
  "Guest Count",
  "Makeup & Styling",
  "Budget"
];

function makeField(label, value) {
  return { id: crypto.randomUUID(), label: label.trim(), value: (value || "").trim() };
}

function makeEvent(userId, name) {
  return {
    id: crypto.randomUUID(),
    userId,
    name: name.trim(),
    fields: DEFAULT_FIELD_LABELS.map((label) => makeField(label, "")),
    createdAt: new Date().toISOString()
  };
}

function findOwnedEvent(data, userId, eventId) {
  return data.events.find((e) => e.id === eventId && e.userId === userId) || null;
}

// GET /api/events — list everything belonging to the signed-in user
router.get("/", (req, res) => {
  const data = db.read();
  const mine = data.events.filter((e) => e.userId === req.userId);
  res.json({ events: mine });
});

// POST /api/events { name }
router.post("/", async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Give this event a name." });
  }

  const data = db.read();
  const event = makeEvent(req.userId, name);
  data.events.push(event);
  await db.write(data);

  res.status(201).json({ event });
});

// PUT /api/events/:id { name }
router.put("/:id", async (req, res) => {
  const { name } = req.body || {};
  const data = db.read();
  const event = findOwnedEvent(data, req.userId, req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found." });

  if (name && name.trim()) event.name = name.trim();
  await db.write(data);

  res.json({ event });
});

// DELETE /api/events/:id
router.delete("/:id", async (req, res) => {
  const data = db.read();
  const event = findOwnedEvent(data, req.userId, req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found." });

  data.events = data.events.filter((e) => e.id !== event.id);
  await db.write(data);

  res.status(204).end();
});

// POST /api/events/:id/fields { label, value }
router.post("/:id/fields", async (req, res) => {
  const { label, value } = req.body || {};
  if (!label || !label.trim()) {
    return res.status(400).json({ error: "Give this detail a label." });
  }

  const data = db.read();
  const event = findOwnedEvent(data, req.userId, req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found." });

  const field = makeField(label, value);
  event.fields.push(field);
  await db.write(data);

  res.status(201).json({ field });
});

// PUT /api/events/:id/fields/:fieldId { label, value }
router.put("/:id/fields/:fieldId", async (req, res) => {
  const { label, value } = req.body || {};
  const data = db.read();
  const event = findOwnedEvent(data, req.userId, req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found." });

  const field = event.fields.find((f) => f.id === req.params.fieldId);
  if (!field) return res.status(404).json({ error: "Detail not found." });

  if (label && label.trim()) field.label = label.trim();
  if (typeof value === "string") field.value = value.trim();
  await db.write(data);

  res.json({ field });
});

// DELETE /api/events/:id/fields/:fieldId
router.delete("/:id/fields/:fieldId", async (req, res) => {
  const data = db.read();
  const event = findOwnedEvent(data, req.userId, req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found." });

  const before = event.fields.length;
  event.fields = event.fields.filter((f) => f.id !== req.params.fieldId);
  if (event.fields.length === before) {
    return res.status(404).json({ error: "Detail not found." });
  }
  await db.write(data);

  res.status(204).end();
});

module.exports = router;
