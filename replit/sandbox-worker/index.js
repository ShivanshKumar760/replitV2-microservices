import amqp from "amqplib";
import fs from "fs";
import { exec } from "child_process";
import path from "path";

const WORKSPACE_ROOT = "/workspaces";

const conn = await amqp.connect(process.env.RABBITMQ_URL);
const channel = await conn.createChannel();
await channel.assertQueue("execution");

channel.consume("execution", async (msg) => {
  const { projectId } = JSON.parse(msg.content.toString());
  const projectPath = path.join(WORKSPACE_ROOT, projectId);

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
  }

  const command = `
  docker run -d \
    --name repl-${projectId} \
    -v ${projectPath}:/workspace \
    -p 0:3000 \
    --memory=256m \
    --cpus=0.5 \
    mini-replit-node \
    nix develop --command sh -c "npm install && node index.js"
  `;

  exec(command);
  channel.ack(msg);
});
