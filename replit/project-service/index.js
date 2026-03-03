import express from "express";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { pool } from "./shared/db.js";
import { authMiddleware } from "./shared/authMiddleware.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PROJECT_PORT || 3001;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const WORKSPACE = "/workspaces";

async function connectToDB() {
  try {
    await pool.connect();
    console.log("Connected to the database");
    //create projects table if it doesn't exist
    await pool.query(`
CREATE TABLE IF NOT EXISTS projects(
  id UUID PRIMARY KEY,
  user_id UUID,
  name TEXT,
  status TEXT
);
`);
  } catch (err) {
    console.error("Error connecting to the database", err);
  }
}

async function startServer() {
  await connectToDB();
  app.listen(PORT, () => {
    console.log(`Project service is running on port ${PORT}`);
  });
}

app.post("/create", authMiddleware, async (req, res) => {
  const { name, dependencies } = req.body;
  const id = uuid();
  const projectPath = path.join(WORKSPACE, id);

  fs.mkdirSync(projectPath, { recursive: true });

  fs.writeFileSync(
    path.join(projectPath, "package.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        type: "module",
        dependencies,
      },
      null,
      2
    )
  );
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

  fs.writeFileSync(
    path.join(projectPath, "index.js"),
    `
import express from "express";
const app = express();
app.get("/", (req,res)=>res.json({message:"Hello"}));
app.listen(3000);
`
  );

  await pool.query(
    "INSERT INTO projects(id,user_id,name,status) VALUES($1,$2,$3,$4)",
    [id, req.user.id, name, "created"]
  );

  res.json({ projectId: id });
});

startServer();
