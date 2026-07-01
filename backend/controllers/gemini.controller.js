const geminiService = require('../services/gemini.service');

exports.getStatus = async (req, res) => {
  return res.json({
    configured: geminiService.isConfigured(),
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  });
};

exports.generate = async (req, res, next) => {
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

exports.chat = async (req, res, next) => {
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
