const APK_URL = "/downloads/ihya-arabic-app-release.apk";
const CHECKSUM_URL = "/downloads/ihya-arabic-app-release.sha256";

const downloadCta = document.querySelector("#downloadCta");
const releaseStatus = document.querySelector("#releaseStatus");
const releaseSize = document.querySelector("#releaseSize");
const releaseChecksum = document.querySelector("#releaseChecksum");

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
  downloadCta.textContent = "Download For Android";
  releaseStatus.textContent = "Release APK ready";

  if (fileSize) {
    releaseSize.textContent = fileSize;
  } else {
    releaseSize.textContent = "Available";
  }
};

const markPendingRelease = () => {
  downloadCta.removeAttribute("href");
  downloadCta.setAttribute("aria-disabled", "true");
  downloadCta.classList.add("is-disabled");
  downloadCta.textContent = "Preparing the Android release";
  releaseStatus.textContent = "Awaiting APK upload";
  releaseSize.textContent = "Will appear after upload";
};

const setChecksum = (checksumText) => {
  const normalized = checksumText.trim();
  if (!normalized) {
    releaseChecksum.textContent = "Checksum file is empty";
    return;
  }

  releaseChecksum.textContent = normalized.split(/\s+/)[0];
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
      releaseChecksum.textContent = "Add ihya-arabic-app-release.sha256 to show integrity data";
      return;
    }

    setChecksum(await response.text());
  } catch (_error) {
    releaseChecksum.textContent = "Checksum unavailable";
  }
};

checkApkAvailability();
loadChecksum();
