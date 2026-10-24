# Security policy

## Supported versions

Security fixes go into the latest release. The desktop app updates itself, and the browser version at [app.rigstick.example](https://app.rigstick.example) always runs the latest build.

## Reporting a vulnerability

Please report security problems privately, never in a public issue or on Discord.

- **Preferred:** use GitHub's [private vulnerability reporting](https://github.com/kaushalisreal/Rigstick/security/advisories/new).
- **Or email** realnikhilyadav9334@gmail.com with "RigStick security" in the subject.

Include the version and platform, what an attacker could do, and the steps or a file that reproduces it. You can expect an acknowledgement within a week. Please give us a reasonable chance to fix the problem before you disclose it publicly. We will credit you in the release notes if you'd like.

## Scope

In scope:

- **Opening files:** any way a crafted `.rigs`, `.piv`, `.stk`, Stick Nodes file or image can run code, read or write files it shouldn't, or crash the app repeatedly.
- **The Electron app:** escaping context isolation or the preload API, and `rigstick://` link handling.
- **Updates:** the update path and installers.
- **The browser build:** its service worker.

The website and community library service at rigstick.example are maintained separately; report problems with them to the same address.
