/**
 * Auth Routes
 * Handles user authentication, registration, password management, and admin user operations
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db/connection.js';
import EmailService from '../services/emailService.js';
import {
  validateUserUpdate,
  validateResetPassword,
  validateId,
  validateRegister,
  validateLogin,
  validateChangePassword
} from '../middleware/validation.js';
import { requireAdmin } from '../middleware/auth.ts';

const router = Router();

// Ensure login_activity table exists (safe with IF NOT EXISTS)
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_activity (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        username VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN DEFAULT true
      );
      CREATE INDEX IF NOT EXISTS idx_login_activity_user ON login_activity(user_id);
      CREATE INDEX IF NOT EXISTS idx_login_activity_time ON login_activity(login_at);
    `);
    console.log('[AUTH] login_activity table ready');
  } catch (err: unknown) {
    console.error('[AUTH] Failed to create login_activity table:', (err as any).message);
  }
})();

// Helper to extract client IP from request
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip || (req as any).connection?.remoteAddress || 'unknown';
}

// Log login activity to database
async function logLoginActivity(
  userId: string,
  username: string,
  ip: string,
  userAgent: string | undefined,
  success: boolean
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO login_activity (user_id, username, ip_address, user_agent, login_at, success)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)`,
      [userId, username, ip, userAgent || null, success]
    );
  } catch (err: unknown) {
    console.warn('[AUTH] Failed to log login activity:', (err as any).message);
  }
}

// Check for concurrent sessions from different IPs in the last 30 minutes
async function checkConcurrentSessions(
  userId: string,
  currentIp: string
): Promise<{ warning: boolean; otherIp?: string }> {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ip_address FROM login_activity
       WHERE user_id = $1
         AND success = true
         AND ip_address != $2
         AND login_at > NOW() - INTERVAL '30 minutes'
       ORDER BY ip_address
       LIMIT 1`,
      [userId, currentIp]
    );
    if (result.rows.length > 0) {
      return { warning: true, otherIp: result.rows[0].ip_address };
    }
    return { warning: false };
  } catch (err: unknown) {
    console.warn('[AUTH] Failed to check concurrent sessions:', (err as any).message);
    return { warning: false };
  }
}

// JWT secrets (MUST be set in environment variables)
const JWT_SECRET: string = process.env.JWT_SECRET as string;
const JWT_REFRESH_SECRET: string = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '_refresh';

// Validate JWT_SECRET is configured
if (!JWT_SECRET) {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set. Application cannot start without it.');
}

// Token expiry times
const ACCESS_TOKEN_EXPIRY: string = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY: number = 7 * 24 * 60 * 60; // 7 days in seconds

// Account lockout tracking
const loginAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkAccountLockout(username: string): { locked: boolean; remainingMs?: number } {
  const record = loginAttempts.get(username);
  if (!record) return { locked: false };

  // Check if lockout has expired
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    return { locked: true, remainingMs: record.lockedUntil - Date.now() };
  }

  // Reset if window has expired
  if (Date.now() - record.firstAttempt > LOCKOUT_WINDOW_MS) {
    loginAttempts.delete(username);
    return { locked: false };
  }

  return { locked: false };
}

function recordFailedLogin(username: string): void {
  const record = loginAttempts.get(username) || { count: 0, firstAttempt: Date.now(), lockedUntil: 0 };

  // Reset if window has expired
  if (Date.now() - record.firstAttempt > LOCKOUT_WINDOW_MS) {
    record.count = 0;
    record.firstAttempt = Date.now();
  }

  record.count++;

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }

  loginAttempts.set(username, record);
}

function clearLoginAttempts(username: string): void {
  loginAttempts.delete(username);
}

// JWT payload interface
interface JwtTokenPayload {
  id: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

// Helper function to create and store refresh token
async function createRefreshToken(
  userId: string,
  ipAddress: string | null = null,
  userAgent: string | null = null
): Promise<string> {
  const refreshToken: string = crypto.randomBytes(32).toString('hex');
  const expiresAt: Date = new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000);

  try {
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, refreshToken, expiresAt, ipAddress, userAgent]
    );
    return refreshToken;
  } catch (error: unknown) {
    // If table doesn't exist yet, skip storing but still return token
    // (for backward compatibility during migration)
    if ((error as any).code === '42P01') {
      return refreshToken;
    }
    throw error;
  }
}

// Middleware to verify JWT token
export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader: string | undefined = req.headers['authorization'];
  const token: string | undefined = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err: jwt.VerifyErrors | null, user: string | jwt.JwtPayload | undefined) => {
    if (err) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    (req as any).user = user;
    next();
  });
};

// Lenient authentication - allows expired tokens (for logout/cleanup endpoints)
export const authenticateTokenLenient = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader: string | undefined = req.headers['authorization'];
  const token: string | undefined = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }, (err: jwt.VerifyErrors | null, user: string | jwt.JwtPayload | undefined) => {
    if (err && err.name !== 'TokenExpiredError') {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }
    (req as any).user = user;
    next();
  });
};

// POST /api/auth/setup - Initial admin setup (only works when no users exist
// AND a deployment-time SETUP_TOKEN is presented via X-Setup-Token header).
// Without SETUP_TOKEN set in env the endpoint is disabled entirely, so a
// DB reset cannot be hijacked by whoever races to /setup first.
router.post('/setup', async (req: Request, res: Response) => {
  try {
    const configuredToken = process.env.SETUP_TOKEN;
    if (!configuredToken) {
      return res.status(404).json({ error: 'Setup endpoint is disabled' });
    }

    const providedToken = req.headers['x-setup-token'];
    const providedTokenStr = Array.isArray(providedToken) ? providedToken[0] : providedToken;
    if (!providedTokenStr || providedTokenStr !== configuredToken) {
      return res.status(403).json({ error: 'Invalid or missing setup token' });
    }

    const { username, email, password, fullName } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if any users exist
    const userCount = await pool.query('SELECT COUNT(*) FROM users');

    if (parseInt(userCount.rows[0].count) > 0) {
      return res.status(403).json({ error: 'Setup already completed. Users exist in the system.' });
    }

    // Hash password
    const passwordHash: string = await bcrypt.hash(password, 10);

    // Create admin user
    const id: string = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, email, full_name, role, is_active, created_at`,
      [id, username, email || null, passwordHash, fullName || null, 'admin', true]
    );

    const user = result.rows[0];

    // Generate access token (short-lived)
    const accessToken: string = jwt.sign(
      { id: user.id, username: user.username, role: user.role } as JwtTokenPayload,
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Create and store refresh token
    const refreshToken: string = await createRefreshToken(
      user.id,
      req.ip || (req as any).connection?.remoteAddress || null,
      req.headers['user-agent'] || null
    );

    res.status(201).json({
      message: 'Admin user created successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active
      },
      accessToken,
      refreshToken,
      expiresIn: 900 // 15 minutes in seconds
    });
  } catch (error: unknown) {
    console.error('Error in setup:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// POST /api/auth/register - Register new user
router.post('/register', validateRegister, async (req: Request, res: Response) => {
  try {
    const { username, email, password, fullName } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const passwordHash: string = await bcrypt.hash(password, 10);

    // Create user — pending admin approval (is_active = false).
    // No tokens are issued until an admin activates the account.
    const id: string = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, email, full_name, role, is_active, created_at`,
      [id, username, email || null, passwordHash, fullName || null, 'user', false]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'Registration received. An administrator must approve your account before you can sign in.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active
      }
    });
  } catch (error: unknown) {
    console.error('Error in register:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Password expiry constant (90 days in milliseconds)
const PASSWORD_EXPIRY_DAYS = 90;

// POST /api/auth/login - Login user
router.post('/login', validateLogin, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Extract IP and user agent for login activity tracking
    const clientIp = getClientIp(req);
    const userAgent = req.headers['user-agent'];

    // Check account lockout
    const lockout = checkAccountLockout(username);
    if (lockout.locked) {
      const minutes = Math.ceil((lockout.remainingMs || 0) / 60000);
      return res.status(429).json({ error: `Account temporarily locked. Try again in ${minutes} minute(s).` });
    }

    // Ensure password_changed_at column exists
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`);
    } catch (err) {
      console.warn('Could not ensure password_changed_at column:', (err as any).message);
    }

    // Find user (include password_hash and password_changed_at for authentication)
    const result = await pool.query(
      'SELECT id, username, email, full_name, role, is_active, password_hash, password_changed_at FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      recordFailedLogin(username);
      // Log failed attempt (unknown user — use username as user_id placeholder)
      await logLoginActivity(username, username, clientIp, userAgent, false);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      await logLoginActivity(user.id, username, clientIp, userAgent, false);
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Verify password
    const validPassword: boolean = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      recordFailedLogin(username);
      // Log failed login attempt
      await logLoginActivity(user.id, username, clientIp, userAgent, false);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    clearLoginAttempts(username);

    // Log successful login activity
    await logLoginActivity(user.id, username, clientIp, userAgent, true);

    // Check for concurrent sessions from different IPs
    const concurrentCheck = await checkConcurrentSessions(user.id, clientIp);

    // Check if password is expired (older than 90 days)
    const passwordChangedAt: Date = user.password_changed_at ? new Date(user.password_changed_at) : new Date(0);
    const daysSinceChange: number = (Date.now() - passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24);
    const passwordExpired: boolean = daysSinceChange >= PASSWORD_EXPIRY_DAYS;

    // Generate access token (short-lived)
    const accessToken: string = jwt.sign(
      { id: user.id, username: user.username, role: user.role } as JwtTokenPayload,
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Create and store refresh token
    const refreshToken: string = await createRefreshToken(
      user.id,
      req.ip || (req as any).connection?.remoteAddress || null,
      req.headers['user-agent'] || null
    );

    console.log('[AUTH] Login successful for user:', user.username, {
      tokenLength: accessToken.length,
      refreshTokenLength: refreshToken.length,
      expiresIn: ACCESS_TOKEN_EXPIRY,
      passwordExpired,
      ip: clientIp,
      concurrentSessionWarning: concurrentCheck.warning
    });

    // Build response with optional concurrent session warning
    const responseData: any = {
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active
      },
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      passwordExpired
    };

    if (concurrentCheck.warning) {
      responseData.concurrentSessionWarning = true;
      responseData.concurrentSessionIp = concurrentCheck.otherIp;
    }

    res.json(responseData);
  } catch (error: unknown) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, full_name, role, is_active, created_at FROM users WHERE id = $1',
      [(req as any).user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at
    });
  } catch (error: unknown) {
    console.error('Error in get current user:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// GET /api/auth/password-status - Check if current user's password is expired
router.get('/password-status', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Ensure column exists
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`);
    } catch (err) {
      console.warn('Could not ensure password_changed_at column:', (err as any).message);
    }

    const result = await pool.query(
      'SELECT password_changed_at FROM users WHERE id = $1',
      [(req as any).user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const passwordChangedAt: Date = user.password_changed_at ? new Date(user.password_changed_at) : new Date(0);
    const daysSinceChange: number = (Date.now() - passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24);
    const passwordExpired: boolean = daysSinceChange >= PASSWORD_EXPIRY_DAYS;
    const daysUntilExpiry: number = Math.max(0, Math.ceil(PASSWORD_EXPIRY_DAYS - daysSinceChange));

    res.json({
      passwordExpired,
      passwordChangedAt: user.password_changed_at,
      daysUntilExpiry,
      expiryDays: PASSWORD_EXPIRY_DAYS
    });
  } catch (error: unknown) {
    console.error('Error checking password status:', error);
    res.status(500).json({ error: 'Failed to check password status' });
  }
});

// GET /api/auth/admin/login-activity - Get recent login activity (admin only)
router.get('/admin/login-activity', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 1000);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const [result, countResult] = await Promise.all([
      pool.query(
        `SELECT id, user_id, username, ip_address, user_agent, login_at, success
         FROM login_activity
         ORDER BY login_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query('SELECT COUNT(*) FROM login_activity'),
    ]);

    res.json({
      data: result.rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        username: row.username,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        loginAt: row.login_at,
        success: row.success
      })),
      total: parseInt(countResult.rows[0].count, 10),
    });
  } catch (error: unknown) {
    console.error('Error fetching login activity:', error);
    res.status(500).json({ error: 'Failed to fetch login activity' });
  }
});

// GET /api/auth/admin/login-activity/:userId - Get login activity for a specific user (admin only)
router.get('/admin/login-activity/:userId', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 1000);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const [result, countResult] = await Promise.all([
      pool.query(
        `SELECT id, user_id, username, ip_address, user_agent, login_at, success
         FROM login_activity
         WHERE user_id = $1
         ORDER BY login_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      pool.query('SELECT COUNT(*) FROM login_activity WHERE user_id = $1', [userId]),
    ]);

    res.json({
      data: result.rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        username: row.username,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        loginAt: row.login_at,
        success: row.success
      })),
      total: parseInt(countResult.rows[0].count, 10),
    });
  } catch (error: unknown) {
    console.error('Error fetching user login activity:', error);
    res.status(500).json({ error: 'Failed to fetch user login activity' });
  }
});

// POST /api/auth/admin/create-user - Create user (admin only)
router.post('/admin/create-user', authenticateToken, requireAdmin, validateRegister, async (req: Request, res: Response) => {
  try {
    const { username, email, password, fullName, role = 'user' } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const passwordHash: string = await bcrypt.hash(password, 10);

    // Create user
    const id: string = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, email, full_name, role, is_active, created_at`,
      [id, username, email || null, passwordHash, fullName || null, role, true]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active
      }
    });
  } catch (error: unknown) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// GET /api/auth/admin/users - List all users (admin only)
router.get('/admin/users', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, full_name, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );

    res.json(result.rows.map((user: any) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at
    })));
  } catch (error: unknown) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// PUT /api/auth/admin/users/:id - Update user (admin only)
router.put('/admin/users/:id', authenticateToken, requireAdmin, validateUserUpdate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, email, fullName, role, isActive } = req.body;

    // Validate inputs
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (role && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be either "user" or "admin"' });
    }

    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if username/email is already taken by another user
    const duplicateCheck = await pool.query(
      'SELECT id FROM users WHERE (username = $1 OR email = $2) AND id != $3',
      [username, email, id]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Update user
    const result = await pool.query(
      `UPDATE users
       SET username = $1, email = $2, full_name = $3, role = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, username, email, full_name, role, is_active, created_at`,
      [username, email || null, fullName || null, role || 'user', isActive !== undefined ? isActive : true, id]
    );

    const user = result.rows[0];

    res.json({
      message: 'User updated successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at
      }
    });
  } catch (error: unknown) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/auth/admin/users/:id/reset-password - Reset user password (admin only)
router.post('/admin/users/:id/reset-password', authenticateToken, requireAdmin, validateResetPassword, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Enforce same password strength rules as user reset (uppercase + lowercase + number)
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' });
    }

    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const passwordHash: string = await bcrypt.hash(newPassword, 10);

    // Update password and reset password_changed_at
    await pool.query(
      'UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, id]
    );

    // Invalidate all refresh tokens for this user
    try {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
        [id]
      );
    } catch (err) {
      console.warn('Could not revoke refresh tokens:', (err as any).message);
    }

    res.json({ message: 'Password reset successfully' });
  } catch (error: unknown) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/auth/me/data-export - POPIA §23 data-subject access request.
// Returns the caller's personal data (profile + login activity + audit entries)
// as a JSON download so they can verify what is held about them.
router.get('/me/data-export', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const profile = await pool.query(
      `SELECT id, username, email, full_name, role, is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );
    if (profile.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const loginActivity = await pool.query(
      `SELECT login_at, ip_address, user_agent, success
       FROM login_activity WHERE user_id = $1
       ORDER BY login_at DESC LIMIT 1000`,
      [userId]
    );

    const auditEntries = await pool.query(
      `SELECT action, entity_type, entity_id, entity_label, created_at
       FROM audit_log WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 5000`,
      [userId]
    );

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="personal-data-${userId}.json"`);
    res.json({
      generatedAt: new Date().toISOString(),
      dataSubject: profile.rows[0],
      loginActivity: loginActivity.rows,
      auditEntries: auditEntries.rows,
      notes: 'This export covers personal data held about you in the Synercore Import Schedule application. For questions or corrections, contact your administrator.'
    });
  } catch (error: unknown) {
    console.error('Error generating data export:', error);
    res.status(500).json({ error: 'Failed to generate data export' });
  }
});

// POST /api/auth/admin/users/:id/erase - POPIA §25 right to deletion.
// Anonymizes the user record (PII → tombstone values) and deletes
// login activity. Audit-log entries are preserved (legal obligation /
// operational integrity) but no longer reference identifiable info
// on their own — the user row's identifying fields are gone.
router.post('/admin/users/:id/erase', authenticateToken, requireAdmin, validateId, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (id === (req as any).user.id) {
      return res.status(400).json({ error: 'Cannot erase your own account' });
    }

    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tombstone = `[ERASED-${Date.now()}]`;
    await pool.query('BEGIN');
    try {
      await pool.query(
        `UPDATE users
         SET username = $2, email = NULL, full_name = NULL,
             password_hash = '!', is_active = false, updated_at = NOW()
         WHERE id = $1`,
        [id, tombstone]
      );
      await pool.query('DELETE FROM login_activity WHERE user_id = $1', [id]);
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }

    res.json({ message: 'User personal data erased; audit trail preserved', tombstone });
  } catch (error: unknown) {
    console.error('Error erasing user:', error);
    res.status(500).json({ error: 'Failed to erase user' });
  }
});

// DELETE /api/auth/admin/users/:id - Delete user (admin only)
router.delete('/admin/users/:id', authenticateToken, requireAdmin, validateId, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === (req as any).user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    res.json({ message: 'User deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST /api/auth/refresh - Refresh access token using refresh token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    // Check if refresh token exists and is valid (not expired or revoked)
    try {
      const tokenResult = await pool.query(
        `SELECT user_id, expires_at, revoked_at FROM refresh_tokens
         WHERE token = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
        [refreshToken]
      );

      if (tokenResult.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }

      const userId: string = tokenResult.rows[0].user_id;

      // Get user data
      const userResult = await pool.query(
        'SELECT id, username, role FROM users WHERE id = $1 AND is_active = true',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'User not found or inactive' });
      }

      const user = userResult.rows[0];

      // Generate new access token
      const newAccessToken: string = jwt.sign(
        { id: user.id, username: user.username, role: user.role } as JwtTokenPayload,
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
      );

      res.json({
        accessToken: newAccessToken,
        expiresIn: 900 // 15 minutes in seconds
      });
    } catch (error: unknown) {
      // If refresh_tokens table doesn't exist, allow legacy token refresh
      if ((error as any).code === '42P01') {
        return res.status(501).json({ error: 'Token refresh not yet available. Please log in again.' });
      }
      throw error;
    }
  } catch (error: unknown) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// POST /api/auth/logout - Revoke refresh token
// Uses lenient auth to allow expired tokens (user trying to logout)
router.post('/logout', authenticateTokenLenient, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    // If user is not found in token (expired or invalid), still allow logout
    if (!(req as any).user || !(req as any).user.id) {
      return res.json({ message: 'Logged out successfully' });
    }

    if (!refreshToken) {
      return res.json({ message: 'Logged out successfully' });
    }

    // Revoke the refresh token
    try {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
         WHERE token = $1 AND user_id = $2`,
        [refreshToken, (req as any).user.id]
      );
    } catch (error: unknown) {
      // Gracefully handle refresh token revocation errors
      // (table might not exist or other DB issues - not critical for logout)
      console.warn('Warning: Could not revoke refresh token:', (error as any).message);
      // Don't re-throw - logout should still succeed even if token revocation fails
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error: unknown) {
    console.error('Error logging out:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

// POST /api/auth/change-password - Change own password
router.post('/change-password', authenticateToken, validateChangePassword, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Get user from database
    const result = await pool.query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [(req as any).user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Verify current password
    const validPassword: boolean = await bcrypt.compare(currentPassword, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash: string = await bcrypt.hash(newPassword, 10);

    // Update password and reset password_changed_at
    await pool.query(
      'UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, (req as any).user.id]
    );

    // Invalidate all refresh tokens for this user
    try {
      await pool.query(
        'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
        [(req as any).user.id]
      );
    } catch (err) {
      // Non-critical - tokens will expire naturally
      console.warn('Could not revoke refresh tokens:', (err as any).message);
    }

    res.json({ message: 'Password changed successfully' });
  } catch (error: unknown) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// POST /api/auth/forgot-password - Request password reset email
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate email format
    const emailRegex: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Find user by email
    const result = await pool.query(
      'SELECT id, email, username FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Always return success (security: don't reveal if email exists)
    if (result.rows.length === 0) {
      return res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
    }

    const user = result.rows[0];

    // Generate reset token (valid for 1 hour)
    const resetToken: string = crypto.randomBytes(32).toString('hex');
    const resetTokenHash: string = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpiry: Date = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token in database
    await pool.query(
      `UPDATE users SET reset_token = $1, reset_token_expiry = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [resetTokenHash, resetTokenExpiry, user.id]
    );

    // Send password reset email
    const resetLink: string = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    const emailResult = await EmailService.sendPasswordResetEmail(email, user.username, resetLink);

    if (emailResult.success) {
      console.log(`Password reset email sent to ${email}`);
    } else {
      console.error(`Failed to send password reset email to ${email}:`, emailResult.error);
      // Still return success message for security (don't reveal if email exists)
    }

    res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
  } catch (error: unknown) {
    console.error('[Auth] Error requesting password reset:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// POST /api/auth/reset-password - Complete password reset with token
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      return res.status(400).json({ error: 'Email, token, and password are required' });
    }

    // Validate password strength (must match registration requirements)
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' });
    }

    // Find user by email
    const result = await pool.query(
      'SELECT id, email, reset_token, reset_token_expiry FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Verify reset token
    const resetTokenHash: string = crypto.createHash('sha256').update(token).digest('hex');

    if (!user.reset_token || user.reset_token !== resetTokenHash) {
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    if (new Date() > user.reset_token_expiry) {
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    // Hash new password
    const passwordHash: string = await bcrypt.hash(password, 10);

    // Update password, clear reset token, and reset password_changed_at
    await pool.query(
      `UPDATE users SET password_hash = $1, password_changed_at = NOW(), reset_token = NULL, reset_token_expiry = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    console.log(`[Auth] Password reset completed for ${email}`);

    res.json({ message: 'Password has been reset successfully. You can now login with your new password.' });
  } catch (error: unknown) {
    console.error('[Auth] Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
