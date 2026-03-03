// import express from "express";
// import dotenv from "dotenv";
// import ampq from "amqplib";
// import { WebSocketServer } from "ws";
// import Docker from "dockerode";
// import { authMiddleware } from "./shared/authMiddleware.js";
// import { verifyToken } from "./shared/jwt.js";

// dotenv.config();

// const app = express();
// const PORT = process.env.EXECUTION_PORT || 3002;

// const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// const conn = await ampq.connect(process.env.RABBITMQ_URL);
// const channel = await conn.createChannel();
// const assertQueue = await channel.assertQueue("execution");

// app.post("/run/:id", authMiddleware, async (req, res) => {
//   channel.sendToQueue(
//     "execution",
//     Buffer.from(JSON.stringify({ projectId: req.params.id }))
//   );
//   res.json({ message: "Event queued" });
// });

// const wss = new WebSocketServer({ port: process.env.WEBSOCKET_PORT || 8080 });

// wss.on("connection", (ws, req) => {
//   const params = new URLSearchParams(req.url.split("?")[1]);
//   const token = params.get("token");
//   const containerId = params.get("id")?.trim();

//   try {
//     verifyToken(token);
//   } catch (err) {
//     ws.send(JSON.stringify({ error: "Unauthorized: " + err.message }));
//     ws.close();
//     return; // ✅ return early so attach never runs
//   }

//   if (!containerId) {
//     ws.send(JSON.stringify({ error: "Missing container ID" }));
//     ws.close();
//     return;
//   }

//   const container = docker.getContainer(containerId);
//   container
//     .attach({ stream: true, stdout: true, stderr: true })
//     .then((stream) => {
//       ws.on("message", (msg) => stream.write(msg));
//       stream.on("data", (chunk) => ws.send(chunk.toString()));
//     })
//     .catch((err) => {
//       console.error("Attach error:", err.message);
//       ws.send(JSON.stringify({ error: err.message }));
//       ws.close();
//     });
// });

// app.listen(PORT, () => {
//   console.log(`Execution service running on port ${PORT}`);
// });

// import express from "express";
// import dotenv from "dotenv";
// import ampq from "amqplib";
// import { WebSocketServer } from "ws";
// import Docker from "dockerode";
// import { PassThrough } from "stream";
// import { authMiddleware } from "./shared/authMiddleware.js";
// import { verifyToken } from "./shared/jwt.js";

// dotenv.config();

// const app = express();
// const PORT = process.env.EXECUTION_PORT || 3003;
// const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// let conn, channel;
// try {
//   conn = await ampq.connect(process.env.RABBITMQ_URL);
//   channel = await conn.createChannel();
//   await channel.assertQueue("execution");
// } catch (err) {
//   console.error("Failed to connect to RabbitMQ:", err.message);
//   process.exit(1);
// }

// app.post("/run/:id", authMiddleware, async (req, res) => {
//   channel.sendToQueue(
//     "execution",
//     Buffer.from(JSON.stringify({ projectId: req.params.id }))
//   );
//   res.json({ message: "Event queued" });
// });

// const wss = new WebSocketServer({
//   port: Number(process.env.WEBSOCKET_PORT) || 4000,
// });

// wss.on("connection", (ws, req) => {
//   const params = new URLSearchParams(req.url.split("?")[1]);
//   const token = params.get("token");
//   const containerId = params.get("id")?.trim();

//   try {
//     verifyToken(token);
//   } catch (err) {
//     ws.send(JSON.stringify({ error: "Unauthorized: " + err.message }));
//     ws.close();
//     return;
//   }

//   if (!containerId) {
//     ws.send(JSON.stringify({ error: "Missing container ID" }));
//     ws.close();
//     return;
//   }

//   const container = docker.getContainer(containerId);
//   container
//     .attach({ stream: true, stdout: true, stderr: true, stdin: true })
//     .then((stream) => {
//       const output = new PassThrough();

//       // demux docker's multiplexed stream into readable output
//       docker.modem.demuxStream(stream, output, output);

//       // send container output to websocket client
//       output.on("data", (chunk) => {
//         if (ws.readyState === ws.OPEN) {
//           ws.send(chunk.toString());
//         }
//       });

//       // send websocket input to container stdin
//       ws.on("message", (msg) => {
//         stream.write(msg);
//       });

//       ws.on("close", () => {
//         stream.destroy();
//       });
//     })
//     .catch((err) => {
//       console.error("Attach error:", err.message);
//       if (ws.readyState === ws.OPEN) {
//         ws.send(JSON.stringify({ error: err.message }));
//         ws.close();
//       }
//     });
// });

// app.listen(PORT, () => {
//   console.log(`Execution service running on port ${PORT}`);
// });

import express from "express";
import dotenv from "dotenv";
import ampq from "amqplib";
import { WebSocketServer } from "ws";
import Docker from "dockerode";
import { authMiddleware } from "./shared/authMiddleware.js";
import { verifyToken } from "./shared/jwt.js";

dotenv.config();

const app = express();
const PORT = process.env.EXECUTION_PORT || 3003;
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

let conn, channel;
try {
  conn = await ampq.connect(process.env.RABBITMQ_URL);
  channel = await conn.createChannel();
  await channel.assertQueue("execution");
} catch (err) {
  console.error("Failed to connect to RabbitMQ:", err.message);
  process.exit(1);
}

app.post("/run/:id", authMiddleware, async (req, res) => {
  channel.sendToQueue(
    "execution",
    Buffer.from(JSON.stringify({ projectId: req.params.id }))
  );
  res.json({ message: "Event queued" });
});

const wss = new WebSocketServer({
  port: Number(process.env.WEBSOCKET_PORT) || 4000,
});

wss.on("connection", async (ws, req) => {
  const params = new URLSearchParams(req.url.split("?")[1]);
  const token = params.get("token");
  const containerId = params.get("id")?.trim();

  try {
    verifyToken(token);
  } catch (err) {
    ws.send(JSON.stringify({ error: "Unauthorized: " + err.message }));
    ws.close();
    return;
  }

  if (!containerId) {
    ws.send(JSON.stringify({ error: "Missing container ID" }));
    ws.close();
    return;
  }

  try {
    const container = docker.getContainer(containerId);

    const exec = await container.exec({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ["/bin/sh"],
    });

    const stream = await exec.start({
      hijack: true,
      stdin: true,
    });

    // stream container output to websocket
    stream.on("data", (chunk) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(chunk.toString());
      }
    });

    // stream websocket input to container shell
    ws.on("message", (msg) => {
      stream.write(msg + "\n");
    });

    ws.on("close", () => {
      stream.destroy();
    });
  } catch (err) {
    console.error("Exec error:", err.message);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ error: err.message }));
      ws.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Execution service running on port ${PORT}`);
});
