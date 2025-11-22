// Email/password authentication for player accounts
import bcrypt from "bcrypt";
import { storage } from "./storage";

const SALT_ROUNDS = 10;

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export async function registerUser(data: RegisterData) {
  const { username, email, password } = data;

  // Validation
  if (!username || username.length < 3 || username.length > 20) {
    throw new Error("Username must be between 3 and 20 characters");
  }

  if (!email || !email.includes("@")) {
    throw new Error("Invalid email address");
  }

  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  // Check if email already exists
  const existingEmailUser = await storage.getUserByEmail(email);
  if (existingEmailUser) {
    throw new Error("Email already registered");
  }

  // Check if username already exists
  const existingUsernameUser = await storage.getUserByUsername(username);
  if (existingUsernameUser) {
    throw new Error("Username already taken");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Create user
  const user = await storage.upsertUser({
    email,
    username,
    passwordHash,
  });

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt,
  };
}

export async function loginUser(data: LoginData) {
  const { email, password } = data;

  // Get user by email
  const user = await storage.getUserByEmail(email);
  if (!user || !user.passwordHash) {
    throw new Error("Invalid email or password");
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid email or password");
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt,
  };
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters");
  }

  const user = await storage.getUser(userId);
  if (!user || !user.passwordHash) {
    throw new Error("User not found");
  }

  // Verify old password
  const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!isValid) {
    throw new Error("Current password is incorrect");
  }

  // Hash new password
  const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Update user
  await storage.updateUserPassword(userId, newPasswordHash);

  return true;
}
