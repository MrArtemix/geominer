/**
 * WebSocket Server - Ge O'Miner Real-time Alerts
 *
 * Standalone Node.js server that bridges Redis Streams to WebSocket clients.
 * Authenticates via JWT (Keycloak) and routes alerts to rooms by zone/role.
 *
 * Usage: npx ts-node src/lib/ws-server/main.ts
 */

import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createClient } from "redis";

const PORT = parseInt(process.env.WS_PORT || "3001", 10);
const REDIS_URL = process.env.REDIS_URL || "redis://:redis_secret_2024@localhost:6379/0";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Redis client for stream reading
const redisClient = createClient({ url: REDIS_URL });

// JWT verification middleware
io.use(async (socket: Socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("Authentication required"));
  }

  try {
    // In production, verify JWT against Keycloak JWKS
    // For dev, accept any non-empty token
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] || "", "base64").toString()
    );
    (socket as any).user = {
      sub: payload.sub,
      email: payload.email,
      roles: payload.realm_access?.roles || [],
    };
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

// Connection handler
io.on("connection", (socket: Socket) => {
  const user = (socket as any).user;
  console.log(`Client connected: ${user?.email || socket.id}`);

  // Join role-based room
  if (user?.roles) {
    for (const role of user.roles) {
      socket.join(`role:${role}`);
    }
  }

  // Join zone-based room
  socket.on("join:zone", (zoneId: string) => {
    socket.join(`zone:${zoneId}`);
    console.log(`${socket.id} joined zone:${zoneId}`);
  });

  socket.on("leave:zone", (zoneId: string) => {
    socket.leave(`zone:${zoneId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Redis Stream consumer - listens for new alerts
async function consumeAlertStream() {
  await redisClient.connect();
  console.log("Connected to Redis, consuming alerts:new stream...");

  let lastId = "$"; // Only new messages

  while (true) {
    try {
      const results = await redisClient.xRead(
        [{ key: "alerts:new", id: lastId }],
        { COUNT: 10, BLOCK: 5000 }
      );

      if (results) {
        for (const stream of results) {
          for (const message of stream.messages) {
            lastId = message.id;
            const alert = message.message;

            console.log(`New alert: ${alert.title || "unknown"}`);

            // Broadcast to all connected clients
            io.emit("alert:new", {
              id: alert.id,
              type: alert.alert_type,
              severity: alert.severity,
              title: alert.title,
              message: alert.message,
              siteId: alert.site_id,
              timestamp: new Date().toISOString(),
            });

            // Send to specific severity rooms
            if (alert.severity === "CRITICAL") {
              io.to("role:SUPER_ADMIN")
                .to("role:OFFICIER_GSLOI")
                .emit("alert:critical", alert);
            }
          }
        }
      }
    } catch (err) {
      console.error("Redis stream error:", err);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// Also consume site updates
async function consumeSiteStream() {
  const siteRedis = createClient({ url: REDIS_URL });
  await siteRedis.connect();

  let lastId = "$";

  while (true) {
    try {
      const results = await siteRedis.xRead(
        [{ key: "sites:updated", id: lastId }],
        { COUNT: 10, BLOCK: 5000 }
      );

      if (results) {
        for (const stream of results) {
          for (const message of stream.messages) {
            lastId = message.id;
            io.emit("site:updated", message.message);
          }
        }
      }
    } catch (err) {
      console.error("Site stream error:", err);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// Start server
httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
  consumeAlertStream().catch(console.error);
  consumeSiteStream().catch(console.error);
});
