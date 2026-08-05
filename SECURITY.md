# Security

## Reporting

Report privately, not in a public issue:

- **Preferred:** [GitHub Security Advisories](../../security/advisories/new)
- **Email:** kiransajanikar@gmail.com

Please include what you did, what happened, and the device and browser you saw
it on.

## What counts as a security issue here

This is a static HTML page and a Caddy reverse proxy on a home LAN. There is no
server-side application, no database and no user accounts, so the interesting
surface is not a classic web CVE. What matters is:

- **Content reaching a child.** Any way to get model output to `speak()` without
  passing `contentOK()`, any input that reliably defeats the `BLOCK` rules, or
  any path that lets the model supply a joke. This is the highest-severity
  category in this project, above anything else on this list.
- **The API key.** It is held in `localStorage` on the device and sent directly
  from the browser to the configured provider. Any way to exfiltrate it, or to
  get the app to send it to an endpoint the user did not configure, is a real
  issue.
- **The helmet control channel.** The BLE link uses an unauthenticated Nordic
  UART Service. Anything that lets an unintended device drive the faceplate
  servo matters, because the servo moves next to a child's face.
- **The LAN deployment.** Caddy's local CA private key sits in the `caddy_data`
  Docker volume. Configuration in this repo that would expose it, or that would
  open ports beyond the local subnet, is in scope.

Out of scope: the certificate warning shown before you install the root CA (that
is the design), and the fact that a device on your LAN can reach the app (also
the design — set up your network accordingly).

## What to expect

This is a personal project maintained by one person in their spare time. There
is no release process, no supported version and no patch SLA. There is only
`main`.

Reports about content reaching a child will be looked at as fast as I am able.
Everything else gets attention when it gets attention. If that is not good
enough for your use case, please do not deploy this.

## If you are deploying this yourself

The threat model assumed throughout is a home LAN and a trusted household. The
app is not hardened for a hostile network, and the ESP32 firmware — which is not
in this repo — has no authentication on its BLE service.
