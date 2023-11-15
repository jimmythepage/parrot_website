document.addEventListener('DOMContentLoaded', (event) => {
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  stopButton.disabled = true;
  document.getElementById('openAIKey').value = localStorage.getItem('openAIKey') || '';
  document.getElementById('gptPromptRecap').value = localStorage.getItem('gptPromptRecap') || '';
  document.getElementById('language').value = localStorage.getItem('language') || '';

  let recorder;
  let audioChunks = [];

  startButton.addEventListener('click', async () => {
    startRecording();
  });

  stopButton.addEventListener('click', () => {
    stopRecording();
  });
});

let recorder;
let data = [];

let openAIKey="";
let gptPromptRecap="Please read this transcript and: - generate a brief recap - recap it in bullet points - extract action points. Do not write anything else."
let language="en";

let microphoneStream;

function saveConfig() {
  localStorage.setItem('openAIKey', document.getElementById('openAIKey').value);
  localStorage.setItem('gptPromptRecap', document.getElementById('gptPromptRecap').value);
  localStorage.setItem('language', document.getElementById('language').value);

  openAIKey=document.getElementById('openAIKey').value;
  gptPromptRecap=document.getElementById('gptPromptRecap').value;
  language=document.getElementById('language').value;
}


async function startRecording() {
  startButton.textContent = 'Recording...'; // Update button text
  startButton.style.backgroundColor = '#ff0000'; // Change to red color
  startButton.disabled = true; // Disable the button to prevent multiple clicks
  stopButton.disabled = false; // Enable the stop button

  saveConfig();
  // Clear previous data
  data = [];
  const currentDate = new Date().toLocaleString('en-US', { timeZone: 'UTC' });
  const transcript_title="Transcript "+ currentDate;
  if (recorder?.state === 'recording') {
    throw new Error('Called startRecording while recording is in progress.');
  }

  microphoneStream = await navigator.mediaDevices.getUserMedia({audio: true});

  const mixedContext = new AudioContext();
  const mixedDest = mixedContext.createMediaStreamDestination();

  mixedContext.createMediaStreamSource(microphoneStream).connect(mixedDest);

  const combinedStream = new MediaStream([
    mixedDest.stream.getTracks()[0]
  ]);

  let options = {};

  if (MediaRecorder.isTypeSupported('audio/webm')) {
    options.mimeType = 'audio/webm';
  } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
    options.mimeType = 'audio/mp4'; // This is commonly supported on iOS.
  } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
    options.mimeType = 'audio/ogg';
  }

  // Start recording.
  recorder = new MediaRecorder(combinedStream,options);
  recorder.ondataavailable = (event) => data.push(event.data);
  const mimeType = recorder.mimeType
  console.log("mimeType"+ mimeType);
  recorder.onstop = () => {
    const blob = new Blob(data, { type: mimeType });
    const url = URL.createObjectURL(blob);
  
    // Create a new anchor element
    const a = document.createElement('a');
    
    // Set the href and download attributes for the anchor element
    // The file extension should match the MIME type
    const fileExtension = mimeType.split('/')[1]; // e.g., 'webm' from 'audio/webm'
    const audioFileName = `${transcript_title}.${fileExtension}`; // Set the file name
    a.href = url;
    a.download = audioFileName; // Set the download file name
  
    
    // Append the anchor to the document
    document.body.appendChild(a);
    
    // Trigger a click on the anchor to start download
    a.click();
    
    // Clean up by removing the anchor element and revoking the blob URL
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("Audio blob saved");

    // Step 1: Convert Blob to File
    const audioFile = new File([blob], audioFileName, { type: mimeType });

    console.log("Audio file prepared");

    // Step 2: Prepare FormData
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model","whisper-1");
    formData.append("language",language);

    console.log("Form data prepared");

    // Step 3: Set up HTTP Request
    const whisperAPIEndpoint = "https://api.openai.com/v1/audio/transcriptions";
    fetch(whisperAPIEndpoint, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + openAIKey
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        // Step 4: Handle Response
        console.log("Transcription: ", data.text); // Display or process the transcription
        askGPTRecap(transcript_title,data.text);
    })
    .catch(error => {
        console.error("Error: ", error);
    });


    // Clear state ready for next recording
    recorder = undefined;
    data = [];
  };
  recorder.start();

  // Record the current state in the URL. This provides a very low-bandwidth
  // way of communicating with the service worker (the service worker can check
  // the URL of the document and see the current recording state). We can't
  // store that directly in the service worker as it may be terminated while
  // recording is in progress. We could write it to storage but that slightly
  // increases the risk of things getting out of sync.
  window.location.hash = 'recording';
}

async function stopRecording() {
  startButton.textContent = 'Start Recording'; // Reset button text
  startButton.style.backgroundColor = '#4CAF50'; // Change back to green color
  startButton.disabled = false; // Enable the start button again
  stopButton.disabled = true; // Disable the stop button until recording is started again
  recorder.stop();

  // Stopping the tracks makes sure the recording icon in the tab is removed.
  recorder.stream.getTracks().forEach((t) => t.stop());

  // Stop all tracks on the original media stream
  if (microphoneStream) {
    microphoneStream.getTracks().forEach(track => track.stop());
  }


  // Update current state in URL
  window.location.hash = '';

  // Note: In a real extension, you would want to write the recording to a more
  // permanent location (e.g IndexedDB) and then close the offscreen document,
  // to avoid keeping a document around unnecessarily. Here we avoid that to
  // make sure the browser keeps the Object URL we create (see above) and to
  // keep the sample fairly simple to follow.
}

async function askGPTRecap(transcript_title,transcript)
{
  fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer '+ openAIKey
    },
    body: JSON.stringify({
      "model": "gpt-3.5-turbo-1106",
      "messages": [
        {
          "role": "system",
          "content": gptPromptRecap
        },
        {
          "role": "user",
          "content": transcript
        }
      ]
    })
  })
  .then(response => response.json())
  .then(data => 
    {
      console.log(data);
      let notes = data.choices[0].message.content;
      console.log("Updating html");
      document.getElementById('transcriptOutput').innerText = transcript;
      document.getElementById('notesOutput').innerText = notes;
    })
  .catch(error => console.error('Error:', error));
}

