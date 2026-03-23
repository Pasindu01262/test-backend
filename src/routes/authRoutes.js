import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { protect, protectWithUser } from '../middleware/auth.js';
import { generateToken } from '../utils/tokens.js';
import { sendMail } from '../utils/email.js';

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/** POST /api/auth/register */
router.post(
  '/register',
  [
    body('name').trim().notEmpty().escape(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    const verifyEmailToken = generateToken();
    const verifyEmailExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
    const role = adminEmail && email.toLowerCase() === adminEmail ? 'admin' : 'customer';

    const user = await User.create({
      name,
      email,
      password,
      role,
      isVerified: false,
      verifyEmailToken,
      verifyEmailExpires,
    });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const verifyLink = `${clientUrl}/verify-email?token=${verifyEmailToken}`;
    await sendMail({
      to: email,
      subject: 'Verify your Belle Sac account',
      html: `<p>Hi ${name},</p><p>Please verify your email: <a href="${verifyLink}">${verifyLink}</a></p>`,
      text: `Verify: ${verifyLink}`,
    });

    const token = signToken(user);
    res.status(201).json({
      message: 'Registration successful. Check your email to verify your account.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  }
);

/** POST /api/auth/login */
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  }
);

/** GET /api/auth/me */
router.get('/me', protectWithUser, (req, res) => {
  res.json({
    user: {
      id: req.userDoc._id,
      name: req.userDoc.name,
      email: req.userDoc.email,
      role: req.userDoc.role,
      isVerified: req.userDoc.isVerified,
      promoOptIn: req.userDoc.promoOptIn,
    },
  });
});

/** GET verify email (link from email) — token in query */
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ message: 'Token required' });
  }
  const user = await User.findOne({
    verifyEmailToken: token,
    verifyEmailExpires: { $gt: new Date() },
  }).select('+verifyEmailToken');
  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired verification link' });
  }
  user.isVerified = true;
  user.verifyEmailToken = undefined;
  user.verifyEmailExpires = undefined;
  await user.save();
  res.json({ message: 'Email verified successfully' });
});

/** POST resend verification */
router.post('/resend-verification', protect, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.isVerified) {
    return res.json({ message: 'Already verified' });
  }
  user.verifyEmailToken = generateToken();
  user.verifyEmailExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const verifyLink = `${clientUrl}/verify-email?token=${user.verifyEmailToken}`;
  await sendMail({
    to: user.email,
    subject: 'Verify your Belle Sac account',
    html: `<p>Hi ${user.name},</p><p><a href="${verifyLink}">Verify email</a></p>`,
    text: verifyLink,
  });
  res.json({ message: 'Verification email sent' });
});

/** POST forgot password */
router.post('/forgot-password', [body('email').isEmail().normalizeEmail()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: 'Invalid email' });
  const user = await User.findOne({ email: req.body.email });
  // Always same response to avoid email enumeration
  const msg = 'If an account exists, a reset link has been sent.';
  if (!user) {
    return res.json({ message: msg });
  }
  user.resetPasswordToken = generateToken();
  user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const link = `${clientUrl}/reset-password?token=${user.resetPasswordToken}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your Belle Sac password',
    html: `<p><a href="${link}">Reset password</a></p>`,
    text: link,
  });
  res.json({ message: msg });
});

/** POST reset password */
router.post(
  '/reset-password',
  [body('token').notEmpty(), body('password').isLength({ min: 6 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid input' });
    }
    const { token, password } = req.body;
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    }).select('+password +resetPasswordToken +resetPasswordExpires');
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.json({ message: 'Password updated. You can log in now.' });
  }
);

export default router;
