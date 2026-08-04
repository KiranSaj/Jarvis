# JARVIS on the home network

Open **https://192.168.0.243/** on any device on the LAN. No internet needed.

---

## Why it is built this way

Browsers only allow the microphone, Web Bluetooth and wake-lock in a
**secure context** — HTTPS, or literally `localhost`. A plain LAN address is
neither, so `http://192.168.0.243:8000` gives you a JARVIS that renders
perfectly and cannot hear a thing.

Switching to HTTPS alone breaks the other half: an HTTPS page is not allowed to
call `http://192.168.0.243:11434`, because browsers block mixed content.

So Caddy serves **both** the app and Ollama from one HTTPS origin:

    https://192.168.0.243/           ->  the app
    https://192.168.0.243/api/chat   ->  proxied to Ollama on the host

Same origin means no mixed content, and no CORS either — `OLLAMA_ORIGINS`
stops mattering entirely.

---

## One-time setup

### 1. Open the firewall — must be run as Administrator

Right-click PowerShell, "Run as administrator", then:

```powershell
New-NetFirewallRule -DisplayName "JARVIS (Caddy) HTTPS" -Direction Inbound `
  -Action Allow -Protocol TCP -LocalPort 443 -RemoteAddress LocalSubnet -Profile Any

New-NetFirewallRule -DisplayName "JARVIS (Caddy) HTTP cert download" -Direction Inbound `
  -Action Allow -Protocol TCP -LocalPort 80 -RemoteAddress LocalSubnet -Profile Any
```

`-RemoteAddress LocalSubnet` matters: it keeps these ports closed on cafe and
airport wifi. Without these rules nothing outside this PC can connect at all.

### 2. Trust the certificate, once per device

Every device must install Caddy's root certificate. It is valid until **2036**,
so this is genuinely once.

Download it on the device from:

    http://192.168.0.243/root.crt

**Android** — Settings → Security & privacy → More security settings →
Encryption & credentials → Install a certificate → **CA certificate** →
"Install anyway" → pick the downloaded file. Android shows a scary
"your network may be monitored" warning; that is expected for any private CA.

**Windows** — double-click `root.crt` → Install Certificate → **Local Machine**
→ Place all certificates in the following store → **Trusted Root Certification
Authorities**.

**iPhone / iPad** — two steps, and the second is easy to miss:
1. Open the URL in Safari, allow the profile, then Settings → General →
   VPN & Device Management → install the profile.
2. Settings → General → About → **Certificate Trust Settings** → turn the
   switch on for "Caddy Local Authority". Without this step it stays untrusted.

> iOS note: Safari has **no Web Bluetooth at all**, so an iPhone or iPad can
> talk to JARVIS but can never drive the helmet servo or LEDs. Android and
> Windows can do both.

### 3. Pin the IP address

The address `192.168.0.243` is written into `Caddyfile`. If the router hands
this PC a different address, everything breaks. Set a **DHCP reservation** for
this machine on the router, or give it a static IP.

### 4. Optional — a nicer name

If the router allows local DNS entries, point `jarvis.home` at 192.168.0.243.
Caddy already holds a certificate for that name, so **https://jarvis.home/**
will work with no further changes.

---

## Running it

```
cd C:\Users\kiran\Downloads\Jarvis
docker compose up -d      # start
docker compose down       # stop
docker compose logs -f    # watch requests
```

Ollama must be running on the host, bound so the container can reach it:

```powershell
[Environment]::SetEnvironmentVariable('OLLAMA_HOST','0.0.0.0','User')
```

This is already set. It binds Ollama to all interfaces, but with no inbound
firewall rule for port 11434, LAN devices still cannot reach Ollama directly —
only Caddy can, and only over HTTPS.

---

## Still works the old way

Serving the folder straight off this PC on port 8000 is unaffected. The app
detects how it was loaded: through the proxy it calls `/api/chat` on the same
origin, and at `localhost:8000` it calls Ollama directly as before.
