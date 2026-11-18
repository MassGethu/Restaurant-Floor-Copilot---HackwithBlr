import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { floorRequest } from "../api/copilot";
import "../autonomy.css";

export default function WelcomePage() {
  const [url, setUrl] = useState(
    new URL("/check-in", window.location.origin).href,
  );
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
    let active = true;
    void floorRequest<{ lan_address: string | null }>("/network")
      .then((result) => {
        if (active && result.lan_address) {
          const address = new URL("/check-in", window.location.origin);
          address.hostname = result.lan_address;
          setUrl(address.href);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Enter the restaurant’s reachable guest check-in URL below.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setQr("");
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      void QRCode.toDataURL(parsed.href, {
        width: 360,
        margin: 4,
        errorCorrectionLevel: "M",
      })
        .then((value) => {
          if (active) {
            setQr(value);
            setError("");
          }
        })
        .catch(() => {
          if (active) setError("Could not generate the QR code.");
        });
    } catch {
      setError("Enter a complete http or https check-in URL.");
    }
    return () => {
      active = false;
    };
  }, [url]);
  const loopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  return (
    <main className="guest-page qr-welcome">
      <section className="guest-card">
        <div className="eyebrow">WELCOME IN</div>
        <h1>Scan to join the waiting list.</h1>
        <p>
          Tell us your name and party size. Your table assignment will appear on
          your phone.
        </p>
        {qr && (
          <img
            className="check-in-qr"
            src={qr}
            alt="Scan this QR code to open guest check-in"
            width={360}
            height={360}
          />
        )}
        <p className="qr-address">{url}</p>
        <p>
          Connect to the restaurant’s Wi-Fi before scanning a local-network
          code.
        </p>
        <details className="qr-controls qr-setup">
          <summary>Sign settings</summary>
          <label>
            Guest check-in URL
            <input
              type="url"
              name="check_in_url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          {loopback && (
            <p className="auto-error">
              This address opens only on this computer. Enter a LAN or hosted
              URL for guests’ phones.
            </p>
          )}
          {error && (
            <p role="alert" className="auto-error">
              {error}
            </p>
          )}
        </details>
        <button
          className="floor-btn primary qr-controls"
          disabled={!qr || loopback}
          onClick={() => window.print()}
        >
          Print welcome sign
        </button>
      </section>
    </main>
  );
}
