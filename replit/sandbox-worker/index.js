import amqp from "amqplib";
import fs from "fs";
import { exec } from "child_process";
import path from "path";

const WORKSPACE_ROOT = "/workspaces";
const WORKSPACE_HOST_ROOT = process.env.WORKSPACE_HOST_PATH || "./workspaces";

const conn = await amqp.connect(process.env.RABBITMQ_URL);
const channel = await conn.createChannel();
console.log("Connected to RabbitMQ, waiting for messages...");
await channel.assertQueue("execution");

channel.consume("execution", async (msg) => {
  console.log("Received message:", msg.content.toString());
  const { projectId } = JSON.parse(msg.content.toString());
  const projectPath = path.join(WORKSPACE_ROOT, projectId); // for fs checks inside container
  const hostProjectPath = path.join(WORKSPACE_HOST_ROOT, projectId); // for docker -v flag
  console.log("Project path:", projectPath);

  if (!fs.existsSync(projectPath)) {
    console.error(`Project ${projectId} not found`);
    channel.ack(msg);
    return;
  }
  const flakePath = path.join(projectPath, "flake.nix");
  if (!fs.existsSync(flakePath)) {
    const flakeContent = `{
  description = "Node.js Dev Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-23.11";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      devShells.\${system}.default = pkgs.mkShell {
        buildInputs = [
          pkgs.nodejs_18
          pkgs.nodePackages.npm
        ];
      };
    };
}`;
    fs.writeFileSync(flakePath, flakeContent, "utf-8");
    console.log("flake.nix created at", flakePath);
  } else {
    console.log("flake.nix already exists at", flakePath);
  }
  let containerName = `repl-${projectId}`;
  const removeCmd = `docker rm -f ${containerName} 2>/dev/null || true`;
  const runCmd = `docker run -d \
  --name ${containerName} \
  --volumes-from sandbox-worker \
  -w /workspaces/${projectId} \
  -p 0:3000 \
  --memory=256m \
  --cpus=0.5 \
  mini-replit-node`;

  exec(removeCmd, () => {
    exec(runCmd, (error, stdout, stderr) => {
      if (error) {
        console.error("Docker run error:", error);
        return;
      }
      console.log("Container started:", stdout.trim());
    });
  });
  channel.ack(msg);
});
