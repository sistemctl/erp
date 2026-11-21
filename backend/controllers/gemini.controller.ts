import type { Handler } from '../types/controller';
import { requireUser } from '../utils/request-user';
import { transactionFinished } from '../utils/transaction-state';
import type { ChatMessage } from '../services/gemini.service';
interface Body { prompt?: unknown; model?: string; messages?: ChatMessage[] }
import geminiService = require('../services/gemini.service');

export const getStatus: Handler<Body> = async (req, res) => {
  return res.json({
    configured: geminiService.isConfigured(),
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  });
};

export const generate: Handler<Body> = async (req, res, next) => {
  try {
    const { prompt, model } = req.body || {};
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'El campo prompt es obligatorio.' });
    }

    const text = await geminiService.generateText(String(prompt).trim(), { model });
    return res.json({ text, model: model || process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
  } catch (error) {
    next(error);
  }
};

export const chat: Handler<Body> = async (req, res, next) => {
  try {
    const { messages, model } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos un mensaje.' });
    }

    const text = await geminiService.chat(messages, { model });
    return res.json({ text, model: model || process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
  } catch (error) {
    next(error);
  }
};
