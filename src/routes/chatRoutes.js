import express from 'express';
import { body, validationResult } from 'express-validator';
import OpenAI from 'openai';
import { ruleBasedReply } from '../utils/chatbot.js';

const router = express.Router();

/** POST /api/chat — public helper bot */
router.post(
  '/',
  [body('message').trim().notEmpty().isLength({ max: 2000 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid message' });
    }

    const { message } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        const openai = new OpenAI({ apiKey });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant for Belle Sac, an online boutique selling women handbags. ' +
                'Keep answers short, friendly, and professional. Do not invent policies; suggest contacting support for account-specific issues.',
            },
            { role: 'user', content: message },
          ],
          max_tokens: 300,
        });
        const reply = completion.choices[0]?.message?.content?.trim();
        if (reply) {
          return res.json({ reply, source: 'openai' });
        }
      } catch (e) {
        console.error('OpenAI chat error:', e.message);
      }
    }

    res.json({ reply: ruleBasedReply(message), source: 'rules' });
  }
);

export default router;
