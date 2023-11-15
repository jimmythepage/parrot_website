const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const multer = require('multer');
const FormData = require('form-data'); // You'll need to install form-data package

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

// Proxy endpoint for GPT API
app.post('/api/proxy/gpt', async (req, res) => {
    const apiKey = req.headers['x-api-key']; // Retrieve API key from headers
  
    try {
      const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body) // Forward the body from the original request
      });
  
      const data = await gptResponse.json();
      res.send(data); // Send the response from GPT API back to the client
    } catch (error) {
      console.error(error);
      res.status(500).send('Error processing GPT request');
    }
});

// Proxy endpoint for Whisper API
app.post('/api/proxy/whisper', upload.any(), async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  // Prepare new FormData for forwarding
  const formData = new FormData();
  req.files.forEach(file => {
    // Assuming 'file' is the field name in your FormData
    formData.append('file', file.buffer, file.originalname);
  });

  // Add additional fields from req.body if needed
  for (const key in req.body) {
    formData.append(key, req.body[key]);
  }

  try {
    const openAIResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders() // Get headers from formData, including Content-Type with boundary
      },
      body: formData
    });

    const data = await openAIResponse.json();
    res.send(data); // Send the response from OpenAI back to the client
  } catch (error) {
    console.error(error);
    res.status(500).send('Error processing request');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
