import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { pool } from "./shared/db.js";
import { generateToken } from "./shared/jwt.js";

dotenv.config();

const app = express();
const PORT = process.env.AUTH_PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function connectToDB() {
  try {
    await pool.connect();
    console.log("Connected to the database");
    //create users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        email TEXT UNIQUE,
        password TEXT
      )
    `);
  } catch (err) {
    console.error("Error connecting to the database", err);
  }
}

async function startServer() {
  await connectToDB();
  app.listen(PORT, () => {
    console.log(`Auth service is running on port ${PORT}`);
  });
}

app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2)",
      [email, hashedPassword]
    );
    res.status(201).json({
      message: "User registered successfully",
      userId: result.rows[0].id,
    });
  } catch {
    console.error("Error registering user");
    res.status(500).json({ message: "Error registering user" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = generateToken({ id: user.id });
    res.json({ token });
  } catch (err) {
    console.error("Error logging in user", err);
    res.status(500).json({ message: "Error logging in user" });
  }
});

startServer();
