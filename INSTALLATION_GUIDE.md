# Installation Guide: MyCinema 🎬

If you see a "Microsoft Defender SmartScreen" or "Windows protected your PC" warning when trying to install MyCinema, download only from the official GitHub release page and confirm the filename/version matches the release notes. This warning appears on unsigned or low-reputation Windows installers because Microsoft cannot yet fully verify the publisher or download reputation.

### How to Install

1.  **Download** the `MyCinema-Setup-X.X.X.exe` file.
2.  **Open** the installer.
3.  If you see the warning:
    - Click on **"More info"** (usually a small link in the text).
    - Click the **"Run anyway"** button that appears.
4.  If your browser (Edge or Chrome) blocks the download:
    - Click the **three dots (...)** or the **arrow** next to the download.
    - Select **"Keep"**.
    - Click **"Show more"** and then **"Keep anyway"**.

---

### Why does this happen?
Windows uses code-signing and download reputation to decide whether an installer should be trusted immediately. MyCinema releases are being moved to a signed-release workflow so Windows can show a verified publisher instead of `Publisher: Unknown`.
