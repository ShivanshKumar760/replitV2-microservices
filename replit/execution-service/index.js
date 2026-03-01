import express from "express";
import dotenv from "dotenv";
import ampq from "amqplib";
import { WebSocketServer } from "ws";
import Docker from "dockerode";
import { authMiddleware } from "../shared/authMiddleware.js";
import { verifyToken } from "../shared/jwt.js";

dotenv.config();

const app = express();
const PORT = process.env.EXECUTION_PORT || 3002;

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const conn = await ampq.connect(process.env.RABBITMQ_URL);
const channel = await conn.createChannel();
const assertQueue = await channel.assertQueue("execution");

app.post("/run/:id", authMiddleware, async (req, res) => {
  channel.sendToQueue(
    "execution",
    Buffer.from(JSON.stringify({ projectId: req.params.id }))
  );
  res.json({ message: "Event queued" });
});

const wss = new WebSocketServer({ port: process.env.WEBSOCKET_PORT || 8080 });

wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.split("?")[1]);
  const token = params.get("token");
  const containerId = params.get("id");
  try {
    verifyToken(token);
    const container = docker.getContainer(containerId);
    container
      .attach({ stream: true, stdout: true, stderr: true })
      .then((stream) => {
        ws.on("message", (msg) => stream.write(msg));
        stream.on("data", (chunk) => ws.send(chunk.toString()));
      });
  } catch (err) {
    ws.send("Unauthorized");
    ws.close();
  }
});

app.listen(PORT, () => {
  console.log(`Execution service running on port ${PORT}`);
});
