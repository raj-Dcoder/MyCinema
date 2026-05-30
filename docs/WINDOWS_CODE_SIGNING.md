# Windows Code Signing

MyCinema's public Windows installer must be signed before it is uploaded to GitHub. Unsigned installers show `Publisher: Unknown` and trigger Microsoft Defender SmartScreen warnings because Windows cannot verify who produced the file.

## Recommended Signing Path

Use a public code-signing identity that chains to a trusted root:

1. A standard OV or EV code-signing certificate from a trusted certificate authority.
2. Microsoft Azure Artifact Signing / Trusted Signing, if the project owner is eligible and the signing service is configured in the build environment.

Do not use a self-signed certificate for public releases. It can be useful for local experiments, but it will not fix SmartScreen for users.

## Standard Certificate Setup

For the current `electron-builder` setup, the simplest supported path is a PFX certificate loaded through environment variables:

```powershell
[Environment]::SetEnvironmentVariable("CSC_LINK", "C:\secure\certs\mycinema-code-signing.pfx", "User")
[Environment]::SetEnvironmentVariable("CSC_KEY_PASSWORD", "your-certificate-password", "User")
```

Open a new terminal after setting the variables, then confirm they exist without printing secrets:

```powershell
if ($env:CSC_LINK) { "CSC_LINK is set" } else { "CSC_LINK is missing" }
if ($env:CSC_KEY_PASSWORD) { "CSC_KEY_PASSWORD is set" } else { "CSC_KEY_PASSWORD is missing" }
```

If the certificate subject does not match the publisher name you want users to see, fix the certificate choice before release. The publisher shown by Windows comes from the signing certificate, not from app UI text.

## Build Commands

Local packaging without mandatory signing:

```powershell
npm run dist:local
```

Public release packaging with mandatory signing:

```powershell
npm run dist
```

Public GitHub release packaging and upload:

```powershell
npm run release:publish
```

`npm run dist` and `npm run release:publish` pass `forceCodeSigning=true`, so they should fail if Electron Builder cannot sign the Windows app.

## Unsigned GitHub Fallback

If the project owner explicitly approves an unsigned GitHub release because no paid certificate or cloud signing service is available yet, use:

```powershell
npm run release:publish:unsigned
```

This is a temporary fallback, not the preferred public release path. Windows may show `Unknown Publisher` or Microsoft Defender SmartScreen warnings for unsigned installers. Keep the release on the official GitHub release page and tell users to verify the filename and version before installing.

## Verify The Signature

After building, run:

```powershell
npm run verify:installer-signature
```

Expected result:

```text
Valid: C:\...\dist\MyCinema Setup X.Y.Z.exe
  Publisher: CN=...
Valid: C:\...\dist\win-unpacked\MyCinema.exe
  Publisher: CN=...
```

If the result says `NotSigned`, `UnknownError`, or anything other than `Valid`, do not publish that installer.

## SmartScreen Notes

Signing fixes `Publisher: Unknown`, but SmartScreen reputation can still take time for a new certificate or a brand-new installer hash. Keep release downloads on the official GitHub release page, avoid replacing uploaded assets with different binaries, and keep signing identity stable across releases so reputation can accumulate.
