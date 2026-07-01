const { GoogleGenerativeAI } = require('@google/generative-ai');

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

exports.isConfigured = () => Boolean(process.env.GEMINI_API_KEY);

exports.getModel = (model = DEFAULT_MODEL) => {
  const client = getClient();
  if (!client) {
    throw new Error('GEMINI_API_KEY no configurada');
  }
  return client.getGenerativeModel({ model });
};

exports.generateText = async (prompt, options = {}) => {
  const model = exports.getModel(options.model);
  const result = await model.generateContent(prompt);
  return result.response.text();
};

exports.chat = async (messages, options = {}) => {
  const model = exports.getModel(options.model);
  const history = (messages || []).slice(0, -1).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(message.content || '') }],
  }));
  const lastMessage = messages[messages.length - 1];
  const chat = model.startChat({ history });
  const result = await chat.sendMessage(String(lastMessage?.content || ''));
  return result.response.text();
};
