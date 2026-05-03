const APK_URL = "/downloads/ihya-arabic-app-release.apk";
const CHECKSUM_URL = "/downloads/ihya-arabic-app-release.sha256";

const downloadCta = document.querySelector("#downloadCta");
const releaseStatus = document.querySelector("#releaseStatus");
const releaseSize = document.querySelector("#releaseSize");
const releaseChecksum = document.querySelector("#releaseChecksum");

const setText = (element, text) => {
  if (element) element.textContent = text;
};

const formatBytes = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return null;

  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let value = size;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const enableDownload = (fileSize) => {
  downloadCta.href = APK_URL;
  downloadCta.setAttribute("download", "ihya-arabic-app-release.apk");
  downloadCta.removeAttribute("aria-disabled");
  downloadCta.classList.remove("is-disabled");
  downloadCta.textContent = "Download for Android";
  setText(releaseStatus, "Release APK ready");

  if (fileSize) {
    setText(releaseSize, fileSize);
  } else {
    setText(releaseSize, "Available");
  }
};

const markPendingRelease = () => {
  downloadCta.href = APK_URL;
  downloadCta.setAttribute("download", "ihya-arabic-app-release.apk");
  downloadCta.removeAttribute("aria-disabled");
  downloadCta.classList.remove("is-disabled");
  downloadCta.textContent = "Download for Android";
  setText(releaseStatus, "Release APK ready");
  setText(releaseSize, "34 MB");
};

const setChecksum = (checksumText) => {
  const normalized = checksumText.trim();
  if (!normalized) {
    setText(releaseChecksum, "Checksum unavailable");
    return;
  }

  setText(releaseChecksum, normalized.split(/\s+/)[0]);
};

const checkApkAvailability = async () => {
  try {
    const response = await fetch(APK_URL, { method: "HEAD", cache: "no-store" });
    if (!response.ok) {
      markPendingRelease();
      return;
    }

    const fileSize = formatBytes(response.headers.get("content-length"));
    enableDownload(fileSize);
  } catch (_error) {
    markPendingRelease();
  }
};

const loadChecksum = async () => {
  try {
    const response = await fetch(CHECKSUM_URL, { cache: "no-store" });
    if (!response.ok) {
      setText(releaseChecksum, "Checksum unavailable");
      return;
    }

    setChecksum(await response.text());
  } catch (_error) {
    setText(releaseChecksum, "Checksum unavailable");
  }
};

checkApkAvailability();
loadChecksum();
