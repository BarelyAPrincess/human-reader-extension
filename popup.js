const setStorageItem = (key, value) => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
};

const readStorage = (keys) => {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result);
    });
  });
};

const setWelcomeScreen = () => {
  document.getElementById("settings").style.display = "none";
  document.getElementById("welcome").style.display = "block";
  document.getElementById("info").style.display = "none";
};

const setSettingsScreen = async () => {
  const settings = document.getElementById("settings");
  const welcome = document.getElementById("welcome");
  const info = document.getElementById("info");
  settings.style.display = "block";
  welcome.style.display = "none";
  info.style.display = "block";

  //assumes storage is already set
  const storage = await readStorage(["mode", "speed"]);
  document.getElementById("mode").value = storage.mode || "eleven_turbo_v2_5";
  setSpeedValue(storage.speed || 1);
  setVolumeValue(storage.volume || 100);
};

const setSpeedValue = (value) => {
  document.getElementById("speedInput").value = value;
  document.getElementById("speedValue").textContent = `${value}x`;
};

const setVolumeValue = (value) => {
  document.getElementById("volumeInput").value = value;
  document.getElementById("volumeValue").textContent = value + "%";
};

const loadStartupData = async () => {
  const voices = await fetchVoices();
  storage = await readStorage([
    "apiKey",
    "selectedVoiceId",
    "mode",
    "voices",
    "speed",
    "volume",
  ]);
  const mode = storage.mode || "eleven_turbo_v2_5";
  document.getElementById("mode").value = mode;
  setSpeedValue(storage.speed || 1);
  setVolumeValue(storage.volume || 100);

  const selectedVoiceId = storage.selectedVoiceId || voices[0].id;
  await setStorageItem("selectedVoiceId", selectedVoiceId);
  await setStorageItem("mode", mode);
};

const populateVoices = async () => {
  const storage = await readStorage(["voices", "selectedVoiceId"]);
  const voices = storage.voices;
  if (voices) {
    const select = document.getElementById("voices");
    select.innerHTML = ""; // Clear existing options

    voices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.id;
      option.text = voice.name;
      select.appendChild(option);
    });
    select.value = storage.selectedVoiceId || voices[0].id;
  }
};

const setAPIKey = async (apiKey) => {
  const response = await fetch("https://api.elevenlabs.io/v1/user", {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });
  if (response.ok) {
    await setStorageItem("apiKey", apiKey);
  } else {
    throw new Error("API request failed");
  }
};

const fetchVoices = async () => {
  const storage = await readStorage(["apiKey"]);
  if (storage.apiKey) {
    let response = await fetch("https://api.elevenlabs.io/v1/voices", {
      method: "GET",
      headers: {
        "xi-api-key": storage.apiKey,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const result = await response.json();
      if (result.voices) {
        const voices = result.voices.map((voice) => ({ id: voice.voice_id, name: voice.name }));
        await setStorageItem("voices", voices);
        await populateVoices();
        return voices;
      }
    } else {
      if (response.status === 401) {
        chrome.storage.local.clear();
        throw new Error("Invalid API key");
      } else {
        console.error(`HTTP error! status: ${response.status}`);
      }
    }
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  const storage = await readStorage(["apiKey"]);
  if (storage.apiKey) {
    await populateVoices();
    await setSettingsScreen();
  } else {
    setWelcomeScreen();
  }
});

document.getElementById("voices").addEventListener("change", async (event) => {
  await setStorageItem("selectedVoiceId", event.target.value);
});

document.getElementById("setApiKey").addEventListener("click", async () => {
  const button = document.getElementById("setApiKey");
  const apiKey = document.getElementById("apiKey").value;
  button.textContent = "...";

  try {
    await setAPIKey(apiKey);
    await loadStartupData();
    await setSettingsScreen();
  } catch (error) {
    console.error(error);
    chrome.storage.local.clear();
    setWelcomeScreen();
    alert("Invalid API key, please try again.");
  } finally {
    button.textContent = "Set";
  }
});

document.getElementById("mode").addEventListener("change", async () => {
  await setStorageItem("mode", document.getElementById("mode").value);
});

document.getElementById("speedInput").addEventListener("input", async () => {
  const value = document.getElementById("speedInput").value;
  setSpeedValue(value);
  await setStorageItem("speed", value);
});

document.getElementById("volumeInput").addEventListener("input", async (e) => {
  const value = document.getElementById("volumeInput").value;
  setVolumeValue(value);
  await setStorageItem("volume", value);
  
  // Send message to content script to update volume in real-time
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { 
      action: "updateVolume", 
      volume: value 
    });
  }
});

document.getElementById("clearStorage").addEventListener("click", () => {
  if (confirm("Are you sure you want to clear your data? This will remove your API key and all your settings.")) {
    chrome.storage.local.clear();
    setWelcomeScreen();
    document.getElementById("apiKey").value = "";
  }
});
