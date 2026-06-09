import {
  bootstrapCameraKit,
  createMediaStreamSource,
  Transform2D
} from "@snap/camera-kit";

const API_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzc5ODkxNjI4LCJzdWIiOiJjMmE2YWE0Zi1kZGYzLTQ1NGUtYTEwYy00MTFhMWRlY2ZmZDV-U1RBR0lOR345Njg3NjcwOC1mMmIxLTQyYmQtYmQyNi1hMTdkZTkwOTU4OTcifQ.9Fn56CVOOifjC5nf2ZBUI3ZGAxbMWVq1s4pUAMfvE_8";
const GROUP_ID = "823dbcd7-8413-41b3-a31c-872a2410e804";

const canvas = document.getElementById("canvas");
const recordButton = document.getElementById("recordButton");
const recordText = document.getElementById("recordText");
const switchCameraBtn = document.getElementById("switchCamera");
const galleryButton = document.getElementById("galleryButton");
const galleryPanel = document.getElementById("galleryPanel");
const closeGallery = document.getElementById("closeGallery");
const galleryList = document.getElementById("galleryList");
const app = document.getElementById("app");

let cameraKit;
let session;
let mediaStream;
let currentFacingMode = "user";

let recorder;
let chunks = [];
let isRecording = false;
let pressTimer;
let isLongPress = false;

const DB_NAME = "web-ar-gallery";
const STORE_NAME = "videos";

async function startAR() {
  try {
    cameraKit = await bootstrapCameraKit({
      apiToken: API_TOKEN
    });

    session = await cameraKit.createSession({
      liveRenderTarget: canvas
    });

    await startCamera(currentFacingMode);

    const result = await cameraKit.lensRepository.loadLensGroups([
      GROUP_ID
    ]);

    console.log("找到的 Lens：", result);

    if (!result.lenses || result.lenses.length === 0) {
      alert("找不到濾鏡，請確認 Lens Group 內有濾鏡並已 Save Changes");
      return;
    }

    const lens = result.lenses[0];

    await session.applyLens(lens);

    console.log("濾鏡已套用：", lens.name, lens.id);

    setupCaptureButton();
    setupCameraSwitch();
    setupGallery();
    setupScreenTap();
  } catch (error) {
    console.error("AR 啟動失敗：", error);
    alert("AR 啟動失敗，請打開 Console 查看錯誤");
  }
}

async function startCamera(facingMode) {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: facingMode,
    width: {
      ideal: 1080
    },
    height: {
      ideal: 1920
    },
    aspectRatio: {
      ideal: 9 / 16
    }
  },
  audio: true
});

  const source = createMediaStreamSource(mediaStream, {
    transform:
      facingMode === "user"
        ? Transform2D.MirrorX
        : Transform2D.None
  });

  await session.setSource(source);
  await session.play();
}

function setupCameraSwitch() {
  switchCameraBtn.onclick = async (event) => {
    event.stopPropagation();

    currentFacingMode =
      currentFacingMode === "user" ? "environment" : "user";

    await startCamera(currentFacingMode);
  };
}

function setupCaptureButton() {
  const startPress = (event) => {
    event.preventDefault();
    event.stopPropagation();

    isLongPress = false;

    pressTimer = setTimeout(() => {
      isLongPress = true;
      startRecording();
    }, 300);
  };

  const endPress = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    clearTimeout(pressTimer);

    if (isLongPress) {
      stopRecording();
    } else {
      await takePhoto();
    }
  };

  recordButton.addEventListener("mousedown", startPress);
  recordButton.addEventListener("mouseup", endPress);
  recordButton.addEventListener("mouseleave", () => {
    clearTimeout(pressTimer);

    if (isRecording) {
      stopRecording();
    }
  });

  recordButton.addEventListener("touchstart", startPress, {
    passive: false
  });

  recordButton.addEventListener("touchend", endPress, {
    passive: false
  });
}

async function takePhoto() {
  try {
    const blob = await new Promise((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/png");
    });

    if (!blob) {
      throw new Error("拍照失敗，無法產生圖片");
    }

    await saveMedia(blob, "photo");
    await renderGallery();

    recordText.textContent = "照片已儲存";
    console.log("拍照完成");
  } catch (error) {
    console.error("拍照失敗：", error);
    alert("拍照失敗，請打開 Console 查看錯誤");
  }
}

function getSupportedMimeType() {
  const types = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4"
  ];

  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function startRecording() {
  if (isRecording) return;

  try {
    const canvasStream = canvas.captureStream(30);

    const audioTracks = mediaStream.getAudioTracks();
    audioTracks.forEach((track) => {
      canvasStream.addTrack(track);
    });

    const mimeType = getSupportedMimeType();

    recorder = mimeType
      ? new MediaRecorder(canvasStream, { mimeType })
      : new MediaRecorder(canvasStream);

    chunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, {
        type: recorder.mimeType || "video/webm"
      });

      await saveMedia(blob, "video");
      await renderGallery();

      recordText.textContent = "影片已儲存";
    };

    recorder.start();

    isRecording = true;
    recordButton.classList.add("recording");
    recordText.textContent = "錄影中，放開停止";

    console.log("開始錄影");
  } catch (error) {
    console.error("錄影失敗：", error);
    alert("錄影失敗，請確認瀏覽器支援 MediaRecorder");
  }
}

function stopRecording() {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  }

  isRecording = false;
  recordButton.classList.remove("recording");

  console.log("停止錄影");
}

function setupScreenTap() {
  app.addEventListener("click", (event) => {
    if (
      event.target === recordButton ||
      event.target === switchCameraBtn ||
      event.target === galleryButton ||
      galleryPanel.contains(event.target)
    ) {
      return;
    }

    console.log("點擊螢幕：切換配件");
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveMedia(blob, type) {
  const db = await openDB();

  const media = {
    id: Date.now(),
    blob,
    type,
    mimeType: blob.type,
    createdAt: new Date().toLocaleString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(media);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getMediaList() {
  const db = await openDB();

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result.reverse());
    };
  });
}

async function deleteMedia(id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function renderGallery() {
  const mediaList = await getMediaList();

  galleryList.innerHTML = "";

  if (mediaList.length === 0) {
    galleryList.innerHTML = "<p>目前還沒有拍攝紀錄</p>";
    return;
  }

  mediaList.forEach((item) => {
    const url = URL.createObjectURL(item.blob);

    const div = document.createElement("div");
    div.className = "gallery-item";

    const preview =
      item.type === "photo"
        ? `<img src="${url}" alt="拍攝照片" style="width:100%;border-radius:14px;background:black;" />`
        : `<video src="${url}" controls playsinline></video>`;

    const fileName =
      item.type === "photo"
        ? `web-ar-photo-${item.id}.png`
        : `web-ar-video-${item.id}.webm`;

    div.innerHTML = `
      ${preview}
      <p>${item.createdAt}</p>
      <div class="gallery-actions">
        <a href="${url}" download="${fileName}">下載</a>
        <button>刪除</button>
      </div>
    `;

    div.querySelector("button").onclick = async () => {
      await deleteMedia(item.id);
      await renderGallery();
    };

    galleryList.appendChild(div);
  });
}

function setupGallery() {
  galleryButton.onclick = async (event) => {
    event.stopPropagation();
    galleryPanel.classList.add("open");
    await renderGallery();
  };

  closeGallery.onclick = (event) => {
    event.stopPropagation();
    galleryPanel.classList.remove("open");
  };
}

startAR();