import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);

// Enable CORS for all routes
app.use(cors({
  origin: "*", // you can replace "*" with your frontend domain for security
  methods: ["GET", "POST"],
}));

// WebSocket servers
const wssESP = new WebSocketServer({ noServer: true });
const wssFrontend = new WebSocketServer({ noServer: true });

let espClients = {}; // { esp1: ws, esp2: ws }
let nextId = 1;

// Upgrade handling for WebSocket paths
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/esp") {
    wssESP.handleUpgrade(req, socket, head, ws =>
      wssESP.emit("connection", ws, req)
    );
  } else if (req.url === "/frontend") {
    wssFrontend.handleUpgrade(req, socket, head, ws =>
      wssFrontend.emit("connection", ws, req)
    );
  } else {
    socket.destroy();
  }
});

// --- ESP connections ---
wssESP.on("connection", (ws) => {
  const espId = `esp${nextId++}`;
  espClients[espId] = ws;
  console.log(`✅ ${espId} connected`);

  ws.on("message", (msg) => {
    const message = msg.toString();
    console.log(`📩 From ${espId}:`, message);

    // Forward sensor data to all frontend clients
    wssFrontend.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "sensor", espId, message }));
      }
    });
  });

  ws.on("close", () => {
    console.log(`❌ ${espId} disconnected`);
    delete espClients[espId];
  });
});

// --- REST API for frontend ---
app.get("/led", (req, res) => {
  const { state, id } = req.query;
  if (!id || !espClients[id]) {
    return res.status(400).send("Invalid ESP id");
  }
  if (!["on", "off"].includes(state)) {
    return res.status(400).send("Use ?state=on or off");
  }

  const cmd = state === "on" ? "LED_ON" : "LED_OFF";
  espClients[id].send(cmd);
  console.log(`➡️ Sent to ${id}: ${cmd}`);
  res.send(`Sent ${cmd} to ${id}`);
});

// List connected devices
app.get("/devices", (req, res) => {
  res.json(Object.keys(espClients));
});

// Root
app.get("/", (req, res) => res.send("ESP Backend is running 🚀"));

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Backend running on ${PORT}`)
);
