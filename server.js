require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const eventRoutes = require("./routes/events");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// serve the frontend
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// basic error handler so unexpected errors return JSON, not an HTML stack trace
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`Wedding Diary running at http://localhost:${PORT}`);
});
